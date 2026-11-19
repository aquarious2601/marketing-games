<?php

declare(strict_types=1);

namespace App\Player;

use App\Store\StoreProvider;
use App\Campaign\CampaignDay;
use App\Entity\Game;
use App\Entity\Player;
use App\Repository\SpinRepository;

/**
 * How many spins a person has left today (F23).
 *
 * The question this answers is about a *person*, not a session, a browser or
 * a device (F23 R2) — which is only a question the database can answer
 * because F19 made one person one row. Two spellings of one number were two
 * players before that, and "how often has this person played" had no
 * meaning.
 *
 * It counts recorded spins rather than anything in the session (F23 R3), so
 * handing over, re-identifying, reloading or walking to the second stall
 * phone changes nothing. That is the whole difference between this and
 * F20, which limits one identification and is deliberately left in place
 * above it.
 */
final class SpinAllowance
{
    public function __construct(
        private readonly StoreProvider $store,
        private readonly SpinRepository $spins,
        private readonly CampaignDay $day,
    ) {
    }

    /**
     * Spins left today on this game, or null when it has no limit
     * (F23 R12, F27 R29). Each game counts its own: an allowance spent on
     * the wheel leaves the gift sheet's untouched (F27 R30).
     *
     * Null rather than a large number, so a caller cannot accidentally
     * render "no limit" as a count, and so `0 === remainingFor(...)` is
     * false for an unlimited campaign without anybody having to think
     * about it.
     */
    public function remainingFor(Player $player, Game $game): ?int
    {
        $limit = $game->getDailyLimit();

        if (null === $limit) {
            return null;
        }

        $used = $this->spins->countForPlayerOnGameSince(
            $player,
            $game,
            $this->day->startOfToday($this->store->getOrCreate()->getTimezoneAsZone()),
        );

        /*
         * F23 R5. Never negative: an admin who lowers the limit below what
         * somebody has already had leaves that person with nothing left for
         * the day, not carrying a debt into tomorrow. Nothing already given
         * away is reclaimed.
         */
        return max(0, $limit - $used);
    }

    /** F23 R10. True only when a limit exists and has been used up. */
    public function isExhausted(Player $player, Game $game): bool
    {
        return 0 === $this->remainingFor($player, $game);
    }
}
