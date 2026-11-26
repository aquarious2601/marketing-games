<?php

declare(strict_types=1);

namespace App\Player;

use App\Entity\Game;
use App\Entity\Player;
use App\Entity\Spin;
use App\Repository\GameRepository;
use App\Repository\PlayerRepository;
use App\Repository\SpinRepository;
use Symfony\Component\HttpFoundation\RequestStack;

/**
 * Who the server is talking to, in each game (F08 R12, F36).
 *
 * The identity lives in the server session and only its id travels, in a
 * cookie the page cannot read. This is the thing that guards the spin
 * (F08 R16), so it must not be anything the browser holds and could edit: a
 * player id in localStorage would let anyone spin as anyone.
 *
 * Symfony starts the session only when something reads or writes it, so a
 * visitor who never submits a number is never given a cookie.
 *
 * ## Why every method takes a game
 *
 * F27 R28 has always said that opening a second game's link identifies the
 * player again *for that game* — they are the same person, and what they are
 * not is already identified somewhere they have not been. Until F36 this
 * class held one player, so it could only keep half of that rule: binding a
 * game identified them nowhere by throwing the previous identification away.
 *
 * It now holds one identification per game, and the game is a parameter
 * rather than something read from the session here. That is deliberate:
 * which game a request is for is {@see \App\Game\GameResolver}'s single
 * answer (F27 R27), and a second copy of that rule living in here is a
 * second copy to eventually disagree.
 */
final class PlayerSession
{
    /**
     * Game id → player id, and game id → spin id.
     *
     * Distinct from anything the security firewall stores, so signing an
     * admin in or out cannot disturb a player, or the reverse.
     */
    private const PLAYERS_KEY = 'app_player_ids';

    /**
     * The spin each identification has already made (F20 R1).
     *
     * The spin's id rather than a boolean, because the page needs the result
     * back after a reload and the spin row is where it lives (F20 R5). A
     * boolean would have said "you have played" and lost the code.
     */
    private const SPINS_KEY = 'app_player_spins';

    /**
     * The game this session is playing (F27 R27).
     *
     * Here rather than in the request, because the alternative is taking the
     * game from something the page sends — and a page that could name its
     * own game could play a promotion the shop has turned off, or spend one
     * game's allowance on another.
     */
    private const GAME_KEY = 'app_player_game';

    /**
     * What F36 replaced: one player and one spin for the whole session.
     *
     * Read, never written. A customer who is mid-game when the release lands
     * holds a session in this shape, and F36 R9 says the deploy does not log
     * them out. Only consulted for the game the session was bound to, which
     * is the one the value meant.
     */
    private const LEGACY_PLAYER_KEY = 'app_player_id';

    private const LEGACY_SPIN_KEY = 'app_player_spin';

    public function __construct(
        private readonly RequestStack $requests,
        private readonly PlayerRepository $players,
        private readonly SpinRepository $spins,
        private readonly GameRepository $games,
    ) {
    }

    /**
     * F27 R20, R27. Which game this browser is looking at.
     *
     * F36 R1: it no longer releases whoever was identified for the last one.
     * That release was this class keeping one player and having to choose;
     * now each game keeps its own, and stepping into one is not stepping out
     * of another.
     */
    public function bindGame(Game $game): void
    {
        $id = $game->getId();

        \assert(null !== $id);

        $this->requests->getSession()->set(self::GAME_KEY, $id);
    }

    /**
     * The game this session is playing, or null when no link has been opened.
     *
     * A session naming a game that has since been deleted or turned off is
     * read as no game at all, which sends the page back to the link it came
     * from rather than letting it play something nobody is offering.
     */
    public function game(): ?Game
    {
        $request = $this->requests->getCurrentRequest();

        if (null === $request || !$request->hasPreviousSession()) {
            return null;
        }

        $id = $request->getSession()->get(self::GAME_KEY);

        if (!\is_int($id)) {
            return null;
        }

        $game = $this->games->find($id);

        if (null === $game || !$game->isLive()) {
            $request->getSession()->remove(self::GAME_KEY);

            return null;
        }

        return $game;
    }

    public function identify(Game $game, Player $player): void
    {
        $id = $player->getId();

        // A player that was never flushed has no id to remember, which would
        // leave the session pointing at nothing. Worth failing loudly: the
        // caller has forgotten to persist.
        \assert(null !== $id);

        $this->remember(self::PLAYERS_KEY, $game, $id);

        /*
         * F20 R11, F36 R6. Identifying is a fresh start for this game:
         * whatever spin was held against it is released, exactly as handing
         * over releases it. An identification buys a spin, so the act of
         * making one has to give one — and it gives one here, not in every
         * game this browser has ever opened.
         *
         * This is what keeps F10 R6 true: a number that has just played may
         * type itself in and play again.
         */
        $this->drop(self::SPINS_KEY, $game);
    }

    /**
     * The player identified for this game, or null when there is nobody.
     *
     * A session naming a player who has since been deleted is cleared rather
     * than trusted (F08 R15): without this the page would believe it was
     * identified and every spin would be refused, with nothing on screen
     * explaining why.
     */
    public function current(Game $game): ?Player
    {
        $id = $this->entry(self::PLAYERS_KEY, self::LEGACY_PLAYER_KEY, $game);

        if (null === $id) {
            return null;
        }

        $player = $this->players->find($id);

        if (null === $player) {
            $this->forget($game);

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
    public function recordSpin(Game $game, Spin $spin): void
    {
        $id = $spin->getId();

        // As in identify(): an unflushed spin has no id, and a session
        // pointing at nothing would silently hand out a second spin.
        \assert(null !== $id);

        $this->remember(self::SPINS_KEY, $game, $id);
    }

    /**
     * The spin this identification made in this game, or null when it has
     * not spun yet (F20 R5).
     *
     * A session naming a spin that no longer exists is read as not having
     * spun and the stale id is dropped (F20 R14), which mirrors how current()
     * treats a deleted player. The alternative — refusing every spin for a
     * session whose row an admin has since deleted — would be a dead page
     * with nothing on it explaining why.
     */
    public function spentSpin(Game $game): ?Spin
    {
        $id = $this->entry(self::SPINS_KEY, self::LEGACY_SPIN_KEY, $game);

        if (null === $id) {
            return null;
        }

        $spin = $this->spins->find($id);

        if (null === $spin) {
            $this->drop(self::SPINS_KEY, $game);

            return null;
        }

        return $spin;
    }

    /**
     * F08 R14, F10 R3, F20 R10: the stall phone's next player must not
     * inherit this one — neither their name nor the spin they have already
     * had.
     *
     * F36 R4: for the game on screen, and only that one. Handing the phone
     * over at the wheel says nothing about the sheet, which the person
     * handing it over may never have opened.
     */
    public function forget(Game $game): void
    {
        $request = $this->requests->getCurrentRequest();

        if (null === $request || !$request->hasPreviousSession()) {
            return;
        }

        $this->drop(self::PLAYERS_KEY, $game);
        $this->drop(self::SPINS_KEY, $game);
    }

    /**
     * One game's entry, or the value F36 replaced when this session predates
     * it (R9).
     *
     * The legacy value is only consulted for the game the session is bound
     * to, because that is the game it meant. Reading it for any other would
     * hand an identification to a game it was never made for.
     */
    private function entry(string $key, string $legacyKey, Game $game): ?int
    {
        $request = $this->requests->getCurrentRequest();

        // No session cookie means no session to read. Touching the session
        // here would start one for every visitor, including the ones who only
        // ever load the wheel.
        if (null === $request || !$request->hasPreviousSession()) {
            return null;
        }

        $session = $request->getSession();
        $gameId = $game->getId();
        $entries = $session->get($key);

        if (\is_array($entries) && \is_int($entries[$gameId] ?? null)) {
            return $entries[$gameId];
        }

        if ($session->get(self::GAME_KEY) !== $gameId) {
            return null;
        }

        $legacy = $session->get($legacyKey);

        return \is_int($legacy) ? $legacy : null;
    }

    private function remember(string $key, Game $game, int $value): void
    {
        $session = $this->requests->getSession();
        $entries = $session->get($key);

        $entries = \is_array($entries) ? $entries : [];
        $entries[$game->getId()] = $value;

        $session->set($key, $entries);
        $this->retireLegacy($session->get(self::GAME_KEY) === $game->getId() ? $key : null);
    }

    private function drop(string $key, Game $game): void
    {
        $session = $this->requests->getSession();
        $entries = $session->get($key);

        if (\is_array($entries)) {
            unset($entries[$game->getId()]);
            $session->set($key, $entries);
        }

        $this->retireLegacy($session->get(self::GAME_KEY) === $game->getId() ? $key : null);
    }

    /**
     * Forgets the pre-F36 value once this game's entry has been written.
     *
     * Without this, clearing a game would appear to do nothing: the entry
     * would go and {@see entry} would read the legacy value straight back.
     */
    private function retireLegacy(?string $key): void
    {
        if (null === $key) {
            return;
        }

        $this->requests->getSession()->remove(
            self::PLAYERS_KEY === $key ? self::LEGACY_PLAYER_KEY : self::LEGACY_SPIN_KEY,
        );
    }
}
