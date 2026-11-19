<?php

declare(strict_types=1);

namespace App\Campaign;

/**
 * When the shop's day begins and ends (F23 R6).
 *
 * Its own namespace, and deliberately not another class under Store:
 * "campaign" is the concept this codebase keeps needing and does not have —
 * the currency and now the spin limit both live on the `branding` row for
 * want of somewhere better (F23 section 13). This is the first piece of the
 * right shape rather than the fourth thing in the wrong one.
 *
 * Everything stored stays in UTC (F23 R9). What this provides is the one
 * instant that separates yesterday from today for the people standing at the
 * stall, which is not the same instant as UTC midnight anywhere the game is
 * actually run.
 */
final class CampaignDay
{
    /**
     * F27 R31. The zone is handed in rather than held, because it is the
     * store's and the store can change it between two requests.
     *
     * F23 R8's fatal check went with it: an identifier the runtime does not
     * recognise is now refused when the admin saves it (F27 R34), which is a
     * better place to catch it than a deploy that will not serve.
     */
    private readonly \DateTimeZone $utc;

    public function __construct()
    {
        $this->utc = new \DateTimeZone('UTC');
    }

    /**
     * The instant the shop's current day began, as UTC (F23 R6, R9).
     *
     * `$now` is injectable so a test can ask about a particular moment
     * without waiting for one. Production never passes it.
     *
     * On the one day a year a timezone skips midnight — spring forward at
     * 00:00, which a handful of zones do — PHP moves the result to 01:00
     * local. That is the correct answer to "when did today start" in a place
     * where 00:00 did not happen.
     */
    public function startOfToday(\DateTimeZone $timezone, ?\DateTimeImmutable $now = null): \DateTimeImmutable
    {
        $local = ($now ?? new \DateTimeImmutable('now', $this->utc))->setTimezone($timezone);

        return $local->setTime(0, 0)->setTimezone($this->utc);
    }
}
