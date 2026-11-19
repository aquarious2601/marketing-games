<?php

declare(strict_types=1);

namespace App\Controller;

use App\Branding\BrandingPresenter;
use App\Game\GameResolver;
use App\Game\LinkKey;
use App\Player\PlayerSession;
use App\Repository\GameRepository;
use App\Store\StoreProvider;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Where a player arrives (F27 R20).
 *
 * The key is resolved here and nowhere else, and resolving it is what binds
 * the session to a game — so every endpoint after this one can take the game
 * from the session and never from the request (R27).
 */
final class PlayController extends AbstractController
{
    public function __construct(
        private readonly GameRepository $games,
        private readonly GameResolver $resolver,
        private readonly PlayerSession $session,
        private readonly StoreProvider $store,
        private readonly BrandingPresenter $branding,
    ) {
    }

    /**
     * F27 R20, R24, R25.
     *
     * A key that is not live and a key that never existed answer identically
     * — same status, same body — because a customer holding a printed link
     * must not be able to tell a finished promotion from a typo, and anybody
     * poking at the installation must not be able to enumerate its games.
     */
    #[Route('/api/play/{key}', name: 'api_play', methods: ['GET'])]
    public function play(string $key): JsonResponse
    {
        if (!LinkKey::looksLikeOne($key)) {
            return $this->gone();
        }

        $game = $this->games->findByKey($key);

        if (null === $game || !$game->isLive()) {
            return $this->gone();
        }

        $this->session->bindGame($game);

        return new JsonResponse([
            'type' => $game->getType()->value,
            'branding' => $this->branding->presentForGame($this->store->getOrCreate(), $game),
        ]);
    }

    /**
     * The game to draw when there is no key (F27 R26).
     *
     * `/` is allowed to work while exactly one game is live, and a page
     * cannot draw a game without knowing its type — a wheel and a sheet are
     * different screens. This answers the same shape `/play/{key}` does, so
     * the page has one question and two ways of asking it.
     *
     * Added while building F28; F28 section 8 records it.
     */
    #[Route('/api/game', name: 'api_game', methods: ['GET'])]
    public function game(): JsonResponse
    {
        $game = $this->resolver->current();

        if (null === $game) {
            return new JsonResponse(
                ['error' => ['status' => Response::HTTP_CONFLICT, 'message' => 'no_game']],
                Response::HTTP_CONFLICT,
            );
        }

        return new JsonResponse([
            'type' => $game->getType()->value,
            'branding' => $this->branding->presentForGame($this->store->getOrCreate(), $game),
        ]);
    }

    /**
     * No body worth reading: the page that shows this says the promotion has
     * ended, and it carries no company name, logo or theme (R25) — there is
     * none to carry in the unknown case, and the two have to look the same.
     */
    private function gone(): JsonResponse
    {
        return new JsonResponse(['error' => 'no_such_game'], Response::HTTP_NOT_FOUND);
    }
}
