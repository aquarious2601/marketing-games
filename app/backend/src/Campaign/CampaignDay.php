<?php

declare(strict_types=1);

namespace App\Campaign;

/**
 * When the shop's day begins and ends (F23 R6).
 *
 * Its own namespace, and deliberately not another class under Branding:
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
    private readonly \DateTimeZone $timezone;

    private readonly \DateTimeZone $utc;

    public function __construct(string $timezone)
    {
        $this->utc = new \DateTimeZone('UTC');

        try {
            $this->timezone = new \DateTimeZone($timezone);
        } catch (\Exception $invalid) {
            /*
             * F23 R8. Loud, and fatal.
             *
             * The tempting alternative is to fall back to UTC and carry on,
             * which would leave a campaign quietly resetting its daily limit
             * in the middle of the trading day — a fault nobody reports
             * because nobody can see it. A deployment that will not serve is
             * caught by P03 R5's health check and rolled back within the
             * minute, which is the cheaper failure by a wide margin.
             */
            throw new \InvalidArgumentException(sprintf(
                'APP_TIMEZONE is "%s", which this runtime does not recognise. '
                .'It must be an IANA identifier such as Europe/Paris or Asia/Ho_Chi_Minh.',
                $timezone,
            ), 0, $invalid);
        }
    }

    public function timezone(): \DateTimeZone
    {
        return $this->timezone;
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
    public function startOfToday(?\DateTimeImmutable $now = null): \DateTimeImmutable
    {
        $local = ($now ?? new \DateTimeImmutable('now', $this->utc))->setTimezone($this->timezone);

        return $local->setTime(0, 0)->setTimezone($this->utc);
    }
}
