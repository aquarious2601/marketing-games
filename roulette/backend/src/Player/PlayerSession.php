<?php

declare(strict_types=1);

namespace App\Player;

use App\Entity\Player;
use App\Repository\PlayerRepository;
use Symfony\Component\HttpFoundation\RequestStack;

/**
 * Who the server is talking to (F08 R12).
 *
 * The identity lives in the server session and only its id travels, in a
 * cookie the page cannot read. This is the thing that now guards the spin
 * (F08 R16), so it must not be anything the browser holds and could edit: a
 * player id in localStorage would let anyone spin as anyone.
 *
 * Symfony starts the session only when something reads or writes it, so a
 * visitor who never submits a number is never given a cookie.
 */
final class PlayerSession
{
    /**
     * Distinct from anything the security firewall stores, so signing an
     * admin in or out cannot disturb a player, or the reverse.
     */
    private const KEY = 'app_player_id';

    public function __construct(
        private readonly RequestStack $requests,
        private readonly PlayerRepository $players,
    ) {
    }

    public function identify(Player $player): void
    {
        $id = $player->getId();

        // A player that was never flushed has no id to remember, which would
        // leave the session pointing at nothing. Worth failing loudly: the
        // caller has forgotten to persist.
        \assert(null !== $id);

        $this->requests->getSession()->set(self::KEY, $id);
    }

    /**
     * The identified player, or null when there is nobody.
     *
     * A session naming a player who has since been deleted is cleared rather
     * than trusted (F08 R15): without this the page would believe it was
     * identified and every spin would be refused, with nothing on screen
     * explaining why.
     */
    public function current(): ?Player
    {
        $request = $this->requests->getCurrentRequest();

        // No session cookie means no session to read. Touching the session
        // here would start one for every visitor, including the ones who only
        // ever load the wheel.
        if (null === $request || !$request->hasPreviousSession()) {
            return null;
        }

        $id = $request->getSession()->get(self::KEY);

        if (!\is_int($id)) {
            return null;
        }

        $player = $this->players->find($id);

        if (null === $player) {
            $this->forget();

            return null;
        }

        return $player;
    }

    /** F08 R14: the stall phone's next player must not inherit this one. */
    public function forget(): void
    {
        $request = $this->requests->getCurrentRequest();

        if (null === $request || !$request->hasPreviousSession()) {
            return;
        }

        $request->getSession()->remove(self::KEY);
    }
}
