<?php

declare(strict_types=1);

namespace App\Games\GiftSheet\Controller;

use App\Dto\Violation;
use App\Entity\Game;
use App\Entity\Reward;
use App\Game\GameType;
use App\Games\GiftSheet\Entity\Gift;
use App\Games\GiftSheet\Repository\GiftRepository;
use App\Repository\GameRepository;
use App\Repository\RewardRepository;
use App\Reward\RewardType;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * Configuring what a sheet gives away (F28 R21–R24).
 *
 * The whole list is replaced on every save, as the wheel's prizes are: a
 * sheet is short, the order matters (R6), and a PUT of the list the admin
 * can see is the one shape that cannot leave the stored order disagreeing
 * with the screen.
 */
#[Route('/api/admin/games/{id}/sheet', name: 'api_admin_sheet_', requirements: ['id' => '\d+'])]
final class SheetAdminController extends AbstractController
{
    /** As WheelWriter's: well above the real range, so any order is reachable. */
    private const PARKING_OFFSET = 1000;

    public function __construct(
        private readonly GameRepository $games,
        private readonly GiftRepository $gifts,
        private readonly RewardRepository $rewards,
        private readonly EntityManagerInterface $entityManager,
        private readonly TranslatorInterface $translator,
    ) {
    }

    #[Route('', name: 'show', methods: ['GET'])]
    public function show(int $id): JsonResponse
    {
        $game = $this->sheetGame($id);

        if (!$game instanceof Game) {
            return $this->notASheet();
        }

        return new JsonResponse($this->present($game));
    }

    #[Route('', name: 'replace', methods: ['PUT'])]
    public function replace(int $id, Request $request): JsonResponse
    {
        $game = $this->sheetGame($id);

        if (!$game instanceof Game) {
            return $this->notASheet();
        }

        try {
            /** @var mixed $payload */
            $payload = json_decode($request->getContent(), true, flags: \JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return $this->invalid([new Violation('', $this->translator->trans('api.invalid_json'))]);
        }

        if (!\is_array($payload) || !\is_array($payload['gifts'] ?? null)) {
            return $this->invalid([new Violation('gifts', $this->translator->trans('api.invalid_object'))]);
        }

        /** @var list<mixed> $wanted */
        $wanted = array_values($payload['gifts']);
        $violations = [];
        $rewards = $this->readRewards($wanted, $violations);

        if ([] !== $violations) {
            return $this->invalid($violations);
        }

        $this->rewrite($game, $rewards);
        $this->entityManager->flush();

        return new JsonResponse($this->present($game));
    }

    /**
     * Replaces the list, reusing the rows that are staying.
     *
     * Reused rather than deleted and recreated, so a gift keeps its id —
     * which costs nothing today and is what stops a later feature (stock, a
     * quantity) from losing whatever it hangs off a gift.
     *
     * @param list<Reward> $rewards
     */
    private function rewrite(Game $game, array $rewards): void
    {
        $existing = [];

        foreach ($this->gifts->onSheet($game) as $gift) {
            $existing[$gift->getReward()->getId()] = $gift;
        }

        $keeping = [];

        foreach ($rewards as $reward) {
            $gift = $existing[$reward->getId()] ?? null;

            if ($gift instanceof Gift) {
                $keeping[] = $gift;
                unset($existing[$reward->getId()]);
            } else {
                $keeping[] = $reward;
            }
        }

        // Whatever the admin took off the sheet, flushed first so its
        // positions are free before anything moves into them.
        foreach ($existing as $gone) {
            $this->entityManager->remove($gone);
        }

        $this->entityManager->flush();

        /*
         * Positions are rewritten in two passes through a parking offset,
         * exactly as WheelWriter does it and for the same reason:
         * `(game_id, position)` is unique, so swapping two gifts would
         * collide the moment the first UPDATE landed. Parking everything
         * well above the real range first makes any order reachable.
         */
        foreach ($keeping as $index => $each) {
            if ($each instanceof Gift) {
                $each->setPosition(self::PARKING_OFFSET + $index);
            }
        }

        $this->entityManager->flush();

        foreach ($keeping as $index => $each) {
            if ($each instanceof Gift) {
                $each->setPosition($index);

                continue;
            }

            $this->entityManager->persist(new Gift($game, $each, $index));
        }

        $this->entityManager->flush();
    }

    /**
     * @param list<mixed>     $wanted
     * @param list<Violation> $violations
     *
     * @return list<Reward>
     */
    private function readRewards(array $wanted, array &$violations): array
    {
        if (\count($wanted) < Gift::MIN_PER_SHEET) {
            // Allowed as a draft, refused on going live (R7). Nothing to
            // say here: an empty list is how an admin clears a sheet.
            return [];
        }

        if (\count($wanted) > Gift::MAX_PER_SHEET) {
            $violations[] = new Violation('gifts', $this->translator->trans('sheet.too_many', [
                '%max%' => Gift::MAX_PER_SHEET,
            ]));

            return [];
        }

        $rewards = [];
        $seen = [];

        foreach ($wanted as $position => $each) {
            $rewardId = \is_array($each) ? ($each['rewardId'] ?? null) : null;

            if (!\is_int($rewardId)) {
                $violations[] = new Violation(
                    'gifts['.$position.']',
                    $this->translator->trans('sheet.reward_required'),
                );

                continue;
            }

            $reward = $this->rewards->find($rewardId);

            if (!$reward instanceof Reward) {
                $violations[] = new Violation(
                    'gifts['.$position.']',
                    $this->translator->trans('sheet.reward_unknown'),
                );

                continue;
            }

            // F28 R5. A sheet gives everything on it, so "you have not won"
            // on one is a contradiction.
            if (RewardType::Nothing === $reward->getType()) {
                $violations[] = new Violation(
                    'gifts['.$position.']',
                    $this->translator->trans('sheet.no_losing_reward'),
                );

                continue;
            }

            // F28 R2. Twice is not better odds, it is a second identical
            // voucher nobody asked for.
            if (isset($seen[$rewardId])) {
                $violations[] = new Violation(
                    'gifts['.$position.']',
                    $this->translator->trans('sheet.reward_twice'),
                );

                continue;
            }

            $seen[$rewardId] = true;
            $rewards[] = $reward;
        }

        return $rewards;
    }

    /**
     * @return array{gifts: list<array<string, mixed>>, maxGifts: int}
     */
    private function present(Game $game): array
    {
        return [
            'gifts' => array_map(
                static fn (Gift $gift): array => [
                    'id' => $gift->getId(),
                    'rewardId' => $gift->getReward()->getId(),
                    // F28 R4: the name is the reward's, so the page can show
                    // a preview without holding the catalogue twice.
                    'name' => $gift->getLabel(),
                    'position' => $gift->getPosition(),
                ],
                $this->gifts->onSheet($game),
            ),
            'maxGifts' => Gift::MAX_PER_SHEET,
        ];
    }

    private function sheetGame(int $id): ?Game
    {
        $game = $this->games->find($id);

        return null !== $game && $game->is(GameType::GiftSheet) ? $game : null;
    }

    private function notASheet(): JsonResponse
    {
        return new JsonResponse(
            [
                'error' => [
                    'status' => Response::HTTP_NOT_FOUND,
                    'message' => $this->translator->trans('game.not_found'),
                ],
            ],
            Response::HTTP_NOT_FOUND,
        );
    }

    /** @param list<Violation> $violations */
    private function invalid(array $violations): JsonResponse
    {
        return new JsonResponse(
            [
                'error' => [
                    'status' => Response::HTTP_UNPROCESSABLE_ENTITY,
                    'message' => $this->translator->trans('sheet.invalid'),
                    'violations' => array_map(
                        static fn (Violation $violation): array => $violation->toArray(),
                        $violations,
                    ),
                ],
            ],
            Response::HTTP_UNPROCESSABLE_ENTITY,
        );
    }
}
