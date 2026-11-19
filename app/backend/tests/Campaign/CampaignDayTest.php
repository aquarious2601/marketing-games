<?php

declare(strict_types=1);

namespace App\Tests\Campaign;

use App\Campaign\CampaignDay;
use PHPUnit\Framework\TestCase;

/**
 * F23 R6 to R9 — where the boundary between yesterday and today actually is.
 *
 * Worth a unit test of its own rather than only being exercised through the
 * controller: the whole feature turns on this one instant, and a test that
 * spins a wheel cannot say whether it got the hour right.
 */
final class CampaignDayTest extends TestCase
{
    /** F23 R7: the default, and what an unconfigured deployment gets. */
    public function testItTreatsUtcMidnightAsTheBoundaryByDefault(): void
    {
        $day = new CampaignDay();
        $zone = new \DateTimeZone('UTC');

        self::assertSame(
            '2026-11-17T00:00:00+00:00',
            $day->startOfToday($zone, self::at('2026-11-17T09:30:00+00:00'))->format(\DateTimeInterface::ATOM),
        );
    }

    /**
     * F23 R6. Paris is an hour ahead in November, so the shop's day began an
     * hour before UTC's did.
     */
    public function testTheDayBeginsAtLocalMidnightNotUtcMidnight(): void
    {
        $day = new CampaignDay();
        $zone = new \DateTimeZone('Europe/Paris');

        self::assertSame(
            '2026-11-16T23:00:00+00:00',
            $day->startOfToday($zone, self::at('2026-11-17T09:30:00+00:00'))->format(\DateTimeInterface::ATOM),
        );
    }

    /**
     * The case the whole setting exists for.
     *
     * At 00:30 in Paris it is still 23:30 of the day before in UTC. A limit
     * counted in UTC would still be holding the player's last spin against
     * them half an hour into the next day — and would then release it at
     * 01:00, in the middle of the night, for reasons nobody could explain.
     */
    public function testJustAfterLocalMidnightTheDayHasAlreadyTurned(): void
    {
        $day = new CampaignDay();
        $zone = new \DateTimeZone('Europe/Paris');

        self::assertSame(
            '2026-11-16T23:00:00+00:00',
            $day->startOfToday($zone, self::at('2026-11-16T23:30:00+00:00'))->format(\DateTimeInterface::ATOM),
        );
    }

    /** The other direction: a stall in Vietnam, seven hours ahead. */
    public function testItWorksEastOfUtcToo(): void
    {
        $day = new CampaignDay();
        $zone = new \DateTimeZone('Asia/Ho_Chi_Minh');

        // 06:00 UTC is 13:00 in Ho Chi Minh City, so the local day began at
        // 17:00 UTC the day before.
        self::assertSame(
            '2026-11-16T17:00:00+00:00',
            $day->startOfToday($zone, self::at('2026-11-17T06:00:00+00:00'))->format(\DateTimeInterface::ATOM),
        );
    }

    /** F23 R9: whatever the setting, the answer is a UTC instant. */
    public function testTheBoundaryIsAlwaysReturnedInUtc(): void
    {
        foreach (['UTC', 'Europe/Paris', 'Asia/Ho_Chi_Minh', 'America/New_York'] as $zone) {
            self::assertSame(
                'UTC',
                (new CampaignDay())->startOfToday(new \DateTimeZone($zone))->getTimezone()->getName(),
                $zone.' did not come back in UTC.',
            );
        }
    }

    /*
     * F23 R8's two tests — an unknown zone and an empty one, both fatal at
     * construction — went with the setting they guarded. F27 R15 moved the
     * clock onto the store, so a zone this runtime does not recognise is now
     * a refused save with a violation against the field (R34), and it is
     * StoreControllerTest and the Store entity that say so.
     *
     * The class itself can no longer be constructed wrongly: it holds no
     * zone to be wrong about.
     */

    private static function at(string $instant): \DateTimeImmutable
    {
        return new \DateTimeImmutable($instant, new \DateTimeZone('UTC'));
    }
}
