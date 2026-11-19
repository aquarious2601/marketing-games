<?php

declare(strict_types=1);

namespace App\Game;

use App\Entity\Game;
use App\Player\PlayerSession;
use App\Repository\GameRepository;

/**
 * Which game a player request is for (F27 R27).
 *
 * One place, because the rule is easy to state and easy to forget: the
 * session decides, and nothing the request body says is consulted. The one
 * concession is `/` (R26), which has no key to go on and is only allowed to
 * work while exactly one game is live.
 */
final class GameResolver
{
    public function __construct(
        private readonly PlayerSession $session,
        private readonly GameRepository $games,
    ) {
    }

    /**
     * The game to play, or null when the visitor is in the wrong place.
     *
     * Null is not an error here. It means "this page needs a link", which is
     * a sentence to show rather than a fault to report (R26).
     */
    public function current(): ?Game
    {
        return $this->session->game() ?? $this->games->theOnlyLiveOne();
    }

    /**
     * The game to play, of the type the caller serves.
     *
     * A wheel endpoint asked for a sheet's game is a client bug rather than a
     * player's mistake, so the caller answers 409 rather than drawing
     * something nobody asked for.
     */
    public function currentOfType(GameType $type): ?Game
    {
        $game = $this->current();

        return null !== $game && $game->is($type) ? $game : null;
    }
}
