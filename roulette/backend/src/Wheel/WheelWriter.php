<?php

declare(strict_types=1);

namespace App\Wheel;

use App\Dto\PrizeDraft;
use App\Dto\Violation;
use App\Dto\WheelDraft;
use App\Entity\Prize;
use App\Entity\Wheel;
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

        $this->entityManager->wrapInTransaction(function () use ($wheel, $draft, $existing): void {
            $this->removeDroppedPrizes($wheel, $draft, $existing);

            // Pass one: park every retained prize out of the way.
            $retained = [];

            foreach ($draft->prizes as $index => $prizeDraft) {
                $prize = null !== $prizeDraft->id ? $existing[$prizeDraft->id] : null;

                if (null === $prize) {
                    $prize = new Prize($prizeDraft->name, $prizeDraft->probability, self::PARKING_OFFSET + $index);
                    $wheel->addPrize($prize);
                } else {
                    $prize->setName($prizeDraft->name);
                    $prize->setProbability($prizeDraft->probability);
                    $prize->setPosition(self::PARKING_OFFSET + $index);
                }

                $retained[$index] = $prize;
            }

            $this->entityManager->flush();

            // Pass two: drop them into their real positions, now unoccupied.
            foreach ($retained as $index => $prize) {
                $prize->setPosition($index);
            }

            $wheel->touch();
            $this->entityManager->flush();
        });

        return [];
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
