<?php

declare(strict_types=1);

namespace App\Games\GiftSheet;

use App\Campaign\CampaignDay;
use App\Entity\Game;
use App\Entity\Player;
use App\Repository\SpinRepository;
use App\Store\StoreProvider;

/**
 * How many sheets a person has left today (F28 R17).
 *
 * Deliberately not SpinAllowance with a flag. The two answer the same
 * question about different things and the difference is the whole rule: the
 * wheel counts spins, and a sheet counts *sheets*. A limit of one on a sheet
 * of three gifts means one sheet, and counting rows — which is what sharing
 * the class would have meant — would refuse the second gift of the first
 * sheet and hand the player a third of what they were promised.
 */
final class SheetAllowance
{
    public function __construct(
        private readonly StoreProvider $store,
        private readonly SpinRepository $spins,
        private readonly CampaignDay $day,
    ) {
    }

    /**
     * Sheets left today, or null when the game has no limit (F27 R29).
     *
     * Null rather than a large number, for the same reason as the wheel's:
     * so a caller cannot render "no limit" as a count, and so
     * `0 === remainingFor(...)` is false for an unlimited game without
     * anybody having to think about it.
     */
    public function remainingFor(Player $player, Game $game): ?int
    {
        $limit = $game->getDailyLimit();

        if (null === $limit) {
            return null;
        }

        $used = $this->spins->countSheetsForPlayerOnGameSince(
            $player,
            $game,
            $this->day->startOfToday($this->store->getOrCreate()->getTimezoneAsZone()),
        );

        // F23 R5's rule, carried over: never negative. An admin who lowers
        // the limit leaves somebody with nothing left for the day rather
        // than a debt, and nothing already given away is reclaimed.
        return max(0, $limit - $used);
    }

    /** F28 R20. True only when a limit exists and has been used up. */
    public function isExhausted(Player $player, Game $game): bool
    {
        return 0 === $this->remainingFor($player, $game);
    }
}
