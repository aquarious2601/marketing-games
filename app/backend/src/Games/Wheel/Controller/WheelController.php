<?php

declare(strict_types=1);

namespace App\Games\Wheel\Controller;

use App\Dto\Violation;
use App\Entity\Game;
use App\Game\GameType;
use App\Repository\GameRepository;
use App\Games\Wheel\Dto\WheelInputParser;
use App\Games\Wheel\WheelPresenter;
use App\Games\Wheel\WheelProvider;
use App\Games\Wheel\WheelWriter;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * Reading and replacing the wheel configuration.
 *
 * Deliberately unauthenticated for now (F01 R15). This must not be deployed
 * publicly before admin authentication exists: anyone who can reach these
 * routes can rewrite the prizes and the odds.
 */
#[Route('/api/admin/games/{id}/wheel', name: 'api_admin_wheel_', requirements: ['id' => '\\d+'])]
final class WheelController extends AbstractController
{
    public function __construct(
        private readonly GameRepository $games,
        private readonly WheelProvider $provider,
        private readonly WheelWriter $writer,
        private readonly WheelPresenter $presenter,
        private readonly WheelInputParser $parser,
        private readonly TranslatorInterface $translator,
    ) {
    }

    #[Route('', name: 'show', methods: ['GET'])]
    public function show(int $id): JsonResponse
    {
        $game = $this->wheelGame($id);

        return $game instanceof Game
            ? new JsonResponse($this->presenter->present($this->provider->getOrCreate($game)))
            : $this->notAWheel();
    }

    #[Route('', name: 'replace', methods: ['PUT'])]
    public function replace(int $id, Request $request): JsonResponse
    {
        $game = $this->wheelGame($id);

        if (!$game instanceof Game) {
            return $this->notAWheel();
        }

        try {
            /** @var mixed $payload */
            $payload = json_decode($request->getContent(), true, flags: \JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return $this->invalid([new Violation('', $this->translator->trans('api.invalid_json'))]);
        }

        [$draft, $violations] = $this->parser->parse($payload);

        if (null === $draft) {
            return $this->invalid($violations);
        }

        // Loading the wheel after parsing keeps a malformed request from
        // creating a default wheel as a side effect.
        $wheel = $this->provider->getOrCreate($game);

        $violations = $this->writer->apply($wheel, $draft);

        if ([] !== $violations) {
            return $this->invalid($violations);
        }

        return new JsonResponse($this->presenter->present($wheel));
    }

    /**
     * F27 R6. The game this wheel belongs to, or null when the id names no
     * game or names a game of another type.
     *
     * One lookup for both endpoints, because "a wheel endpoint for a sheet"
     * and "a wheel endpoint for nothing" deserve the same answer: a 404 that
     * says nothing about which of the two it was.
     */
    private function wheelGame(int $id): ?Game
    {
        $game = $this->games->find($id);

        return null !== $game && $game->is(GameType::Wheel) ? $game : null;
    }

    private function notAWheel(): JsonResponse
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

    /**
     * F01 R12. Shaped like the error envelope the API uses everywhere else,
     * with the per-field detail added.
     *
     * @param list<Violation> $violations
     */
    private function invalid(array $violations): JsonResponse
    {
        return new JsonResponse(
            [
                'error' => [
                    'status' => Response::HTTP_UNPROCESSABLE_ENTITY,
                    'message' => $this->translator->trans('wheel.invalid'),
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
