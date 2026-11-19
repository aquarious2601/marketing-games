<?php

declare(strict_types=1);

namespace App\Player;

use App\Entity\Player;
use App\Entity\Spin;
use App\Repository\PlayerRepository;
use App\Repository\SpinRepository;
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
 *
 * Since F20 it holds two things: who, and whether they have spun. Both are
 * here rather than in the page for the same reason — a page that could edit
 * the second one could mint prizes (F20 R13).
 */
final class PlayerSession
{
    /**
     * Distinct from anything the security firewall stores, so signing an
     * admin in or out cannot disturb a player, or the reverse.
     */
    private const KEY = 'app_player_id';

    /**
     * The spin this identification has already made (F20 R1).
     *
     * The spin's id rather than a boolean, because the page needs the result
     * back after a reload and the spin row is where it lives (F20 R5). A
     * boolean would have said "you have played" and lost the code.
     */
    private const SPIN_KEY = 'app_player_spin';

    public function __construct(
        private readonly RequestStack $requests,
        private readonly PlayerRepository $players,
        private readonly SpinRepository $spins,
    ) {
    }

    public function identify(Player $player): void
    {
        $id = $player->getId();

        // A player that was never flushed has no id to remember, which would
        // leave the session pointing at nothing. Worth failing loudly: the
        // caller has forgotten to persist.
        \assert(null !== $id);

        $session = $this->requests->getSession();
        $session->set(self::KEY, $id);

        /*
         * F20 R11. Identifying is a fresh start: whatever spin was held
         * against this session is released, exactly as handing over releases
         * it. An identification buys a spin, so the act of making one has to
         * give one.
         *
         * This is what keeps F10 R6 true — a number that has just played may
         * type itself in and play again — and it is why F20 limits an
         * identification rather than a person. A reload costs nothing and is
         * now stopped; typing a number in again costs typing a number in
         * again, which is the eligibility feature's business and not this
         * one's.
         */
        $session->remove(self::SPIN_KEY);
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

    /**
     * F20 R1, R4. Remembers that this identification has had its spin.
     *
     * The player is deliberately left in place. Forgetting them here would
     * be the shorter fix and would throw away the reward code the player is
     * reading off the screen — see F20 section 13.
     */
    public function recordSpin(Spin $spin): void
    {
        $id = $spin->getId();

        // As in identify(): an unflushed spin has no id, and a session
        // pointing at nothing would silently hand out a second spin.
        \assert(null !== $id);

        $this->requests->getSession()->set(self::SPIN_KEY, $id);
    }

    /**
     * The spin this identification made, or null when it has not spun yet
     * (F20 R5).
     *
     * A session naming a spin that no longer exists is read as not having
     * spun and the stale id is dropped (F20 R14), which mirrors how current()
     * treats a deleted player. The alternative — refusing every spin for a
     * session whose row an admin has since deleted — would be a dead page
     * with nothing on it explaining why.
     */
    public function spentSpin(): ?Spin
    {
        $request = $this->requests->getCurrentRequest();

        if (null === $request || !$request->hasPreviousSession()) {
            return null;
        }

        $id = $request->getSession()->get(self::SPIN_KEY);

        if (!\is_int($id)) {
            return null;
        }

        $spin = $this->spins->find($id);

        if (null === $spin) {
            $request->getSession()->remove(self::SPIN_KEY);

            return null;
        }

        return $spin;
    }

    /**
     * F08 R14, F20 R10: the stall phone's next player must not inherit this
     * one — neither their name nor the spin they have already had.
     */
    public function forget(): void
    {
        $request = $this->requests->getCurrentRequest();

        if (null === $request || !$request->hasPreviousSession()) {
            return;
        }

        $request->getSession()->remove(self::KEY);
        $request->getSession()->remove(self::SPIN_KEY);
    }
}
