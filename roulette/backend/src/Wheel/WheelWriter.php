<?php

declare(strict_types=1);

namespace App\Wheel;

use App\Dto\PrizeDraft;
use App\Dto\Violation;
use App\Dto\WheelDraft;
use App\Entity\Prize;
use App\Entity\Reward;
use App\Entity\Wheel;
use App\Repository\RewardRepository;
use App\Reward\RewardType;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * Applies a validated configuration to the stored wheel, as one all-or-nothing
 * change (F01 R10).
 */
final class WheelWriter
{
    /**
     * Positions are rewritten in two passes through this offset, because
     * `(wheel_id, position)` is unique and swapping two prizes would otherwise
     * collide the moment the first UPDATE lands. Parking everything well above
     * the real range first makes any order reachable.
     */
    private const PARKING_OFFSET = 1000;

    public function __construct(
        private readonly EntityManagerInterface $entityManager,
        private readonly TranslatorInterface $translator,
        private readonly RewardRepository $rewards,
    ) {
    }

    /**
     * @return list<Violation> empty when the save succeeded
     */
    public function apply(Wheel $wheel, WheelDraft $draft): array
    {
        $existing = [];

        foreach ($wheel->getPrizes() as $prize) {
            $existing[$prize->getId()] = $prize;
        }

        $violations = $this->findUnknownIds($draft, $existing);

        if ([] !== $violations) {
            return $violations;
        }

        [$rewards, $violations] = $this->resolveRewards($draft);

        if ([] !== $violations) {
            return $violations;
        }

        $violations = $this->checkLosingSlices($draft, $rewards);

        if ([] !== $violations) {
            return $violations;
        }

        $this->entityManager->wrapInTransaction(function () use ($wheel, $draft, $existing, $rewards): void {
            $this->removeDroppedPrizes($wheel, $draft, $existing);

            // Pass one: park every retained prize out of the way.
            $retained = [];

            foreach ($draft->prizes as $index => $prizeDraft) {
                $prize = null !== $prizeDraft->id ? $existing[$prizeDraft->id] : null;

                $reward = $rewards[$prizeDraft->rewardId];

                if (null === $prize) {
                    $prize = new Prize(
                        $prizeDraft->name,
                        $prizeDraft->probability,
                        self::PARKING_OFFSET + $index,
                        $reward,
                    );
                    $wheel->addPrize($prize);
                } else {
                    $prize->setName($prizeDraft->name);
                    $prize->setProbability($prizeDraft->probability);
                    $prize->setPosition(self::PARKING_OFFSET + $index);
                    $prize->setReward($reward);
                }

                $retained[$index] = $prize;
            }

            $this->entityManager->flush();

            // Pass two: drop them into their real positions, now unoccupied.
            foreach ($retained as $index => $prize) {
                $prize->setPosition($index);
            }

            $wheel->setIncludesLosingSlice($draft->includesLosingSlice);
            $wheel->touch();
            $this->entityManager->flush();
        });

        return [];
    }

    /**
     * Every reward the draft names, or the reasons one is missing (F13 R7).
     *
     * Looked up in one query rather than per slice: a twelve-slice wheel
     * would otherwise be twelve round trips to say the same thing.
     *
     * @return array{array<int, Reward>, list<Violation>}
     */
    private function resolveRewards(WheelDraft $draft): array
    {
        $wanted = array_values(array_unique(array_map(
            static fn ($prizeDraft): int => $prizeDraft->rewardId,
            $draft->prizes,
        )));

        $found = [];

        foreach ($this->rewards->findBy(['id' => $wanted]) as $reward) {
            $found[(int) $reward->getId()] = $reward;
        }

        $violations = [];

        foreach ($draft->prizes as $index => $prizeDraft) {
            if (!isset($found[$prizeDraft->rewardId])) {
                $violations[] = new Violation(
                    sprintf('prizes[%d].rewardId', $index),
                    $this->translator->trans('wheel.unknown_reward'),
                );
            }
        }

        return [$found, $violations];
    }

    /**
     * F13 R14: at most one losing slice.
     *
     * Two of them is not a configuration anybody means, and it would make
     * "the losing slice" — which the toggle talks about as though there is
     * one — a phrase with no referent.
     *
     * @param array<int, Reward> $rewards
     *
     * @return list<Violation>
     */
    private function checkLosingSlices(WheelDraft $draft, array $rewards): array
    {
        $losing = [];

        foreach ($draft->prizes as $index => $prizeDraft) {
            if (RewardType::Nothing === $rewards[$prizeDraft->rewardId]->getType()) {
                $losing[] = $index;
            }
        }

        if (\count($losing) < 2) {
            return [];
        }

        return [new Violation(
            sprintf('prizes[%d].rewardId', $losing[1]),
            $this->translator->trans('wheel.one_losing_slice'),
        )];
    }

    /**
     * An id the client sent that this wheel does not have means the admin is
     * working from a stale page. Saying so is better than silently creating a
     * duplicate prize.
     *
     * @param array<int, Prize> $existing
     *
     * @return list<Violation>
     */
    private function findUnknownIds(WheelDraft $draft, array $existing): array
    {
        $violations = [];

        foreach ($draft->prizes as $index => $prizeDraft) {
            if (null !== $prizeDraft->id && !isset($existing[$prizeDraft->id])) {
                $violations[] = new Violation(
                    sprintf('prizes[%d].id', $index),
                    $this->translator->trans('wheel.prize_gone'),
                );
            }
        }

        return $violations;
    }

    /**
     * @param array<int, Prize> $existing
     */
    private function removeDroppedPrizes(Wheel $wheel, WheelDraft $draft, array $existing): void
    {
        $keptIds = [];

        foreach ($draft->prizes as $prizeDraft) {
            if (null !== $prizeDraft->id) {
                $keptIds[$prizeDraft->id] = true;
            }
        }

        foreach ($existing as $id => $prize) {
            if (!isset($keptIds[$id])) {
                $wheel->removePrize($prize);
            }
        }

        // Flushing the deletions separately frees their positions before the
        // remaining prizes are moved into place.
        $this->entityManager->flush();
    }
}
