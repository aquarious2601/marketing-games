<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Store\StoreProvider;
use App\Campaign\CampaignDay;
use App\Entity\Store;
use App\Entity\Game;
use App\Entity\Spin;
use App\Tests\Support\DatabaseWebTestCase;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\Response;

/**
 * F23 — how often one person may play in a day.
 *
 * Its own file rather than more of PlayerControllerTest, because the feature
 * is not one controller's: the refusal is at the wheel, the count is
 * reported by three identity routes, and the rule itself is on the campaign.
 * Reading them together is the only way to see that they agree.
 */
final class DailySpinLimitTest extends DatabaseWebTestCase
{
    private const SPIN_URI = '/api/spin';
    private const ME_URI = '/api/player/me';
    private const PHONE = '0912345678';

    // ------------------------------------------------- no limit, as before

    /**
     * F23 R1. The default, and what every campaign that predates this
     * feature keeps.
     */
    public function testWithNoLimitAPersonMaySpinAsOftenAsTheyLike(): void
    {
        $this->identifyAsPlayer(self::PHONE);
        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();

        $this->spinOnceMore(self::PHONE);
        $this->spinOnceMore(self::PHONE);

        self::assertSame(3, $this->spinCount());
    }

    /** F23 R12: nothing to count against, so nothing to report. */
    public function testWithNoLimitTheSpinsLeftIsNull(): void
    {
        $this->identifyAsPlayer(self::PHONE);

        $this->client->request('GET', self::ME_URI);

        self::assertNull($this->decodeResponse()['spinsLeft']);
    }

    // ----------------------------------------------------- the limit bites

    /** F23 R10. */
    public function testASecondSpinOnTheSameDayIsRefused(): void
    {
        $this->limitTo(1);

        $this->identifyAsPlayer(self::PHONE);
        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();

        // Identifying again is what gets past F20; it must not get past
        // this (F23 R2, R3).
        $this->post('/api/player/identify', ['phone' => self::PHONE]);
        $this->client->request('POST', self::SPIN_URI);

        self::assertResponseStatusCodeSame(Response::HTTP_TOO_MANY_REQUESTS);
    }

    /** F23 R10: nothing is drawn, so the shop pays nothing for a refusal. */
    public function testARefusedSpinRecordsNothingAndMintsNoCode(): void
    {
        $this->limitTo(1);

        $this->identifyAsPlayer(self::PHONE);
        $this->client->request('POST', self::SPIN_URI);

        $codes = $this->rewardCodes();

        $this->post('/api/player/identify', ['phone' => self::PHONE]);
        $this->client->request('POST', self::SPIN_URI);

        self::assertSame(1, $this->spinCount(), 'A refused spin was recorded.');
        self::assertSame($codes, $this->rewardCodes(), 'A refused spin minted a code.');
    }

    /** F23 R12: the count comes down as they play. */
    public function testTheSpinsLeftCountsDown(): void
    {
        $this->limitTo(3);

        $this->identifyAsPlayer(self::PHONE);
        self::assertSame(3, $this->spinsLeft());

        $this->client->request('POST', self::SPIN_URI);
        self::assertSame(2, $this->spinsLeft());

        $this->spinOnceMore(self::PHONE);
        self::assertSame(1, $this->spinsLeft());

        $this->spinOnceMore(self::PHONE);
        self::assertSame(0, $this->spinsLeft());

        $this->post('/api/player/identify', ['phone' => self::PHONE]);
        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseStatusCodeSame(Response::HTTP_TOO_MANY_REQUESTS);
    }

    /**
     * F23 R5. Lowering the limit below what somebody has already had leaves
     * them with nothing left, not with a negative number the page would
     * have to make sense of.
     */
    public function testLoweringTheLimitBelowWhatSomebodyHasHadLeavesThemAtZero(): void
    {
        $this->identifyAsPlayer(self::PHONE);
        $this->client->request('POST', self::SPIN_URI);
        $this->spinOnceMore(self::PHONE);
        $this->spinOnceMore(self::PHONE);

        $this->limitTo(1);

        self::assertSame(0, $this->spinsLeft());
        self::assertSame(3, $this->spinCount(), 'A spin already given away was taken back.');
    }

    // ------------------------------------------------------- where the day ends

    /**
     * F23 R6. The spin happened a minute before the shop's day began, so it
     * belongs to yesterday however the clock is configured.
     */
    public function testASpinFromBeforeTodayDoesNotCount(): void
    {
        $this->limitTo(1);

        $this->identifyAsPlayer(self::PHONE);
        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();

        $this->moveEverySpinTo($this->startOfToday()->modify('-1 minute'));

        self::assertSame(1, $this->spinsLeft(), 'Yesterday was counted against today.');

        $this->post('/api/player/identify', ['phone' => self::PHONE]);
        $this->client->request('POST', self::SPIN_URI);

        self::assertResponseIsSuccessful();
    }

    /** The other side of the same minute. */
    public function testASpinAtTheVeryStartOfTodayCounts(): void
    {
        $this->limitTo(1);

        $this->identifyAsPlayer(self::PHONE);
        $this->client->request('POST', self::SPIN_URI);

        $this->moveEverySpinTo($this->startOfToday());

        self::assertSame(0, $this->spinsLeft());
    }

    // --------------------------------------------------------- one person

    /**
     * F23 R2 with F19. The two spellings are one person, so they share one
     * allowance — which is the fact that made this feature possible at all.
     */
    public function testTwoSpellingsOfOneNumberShareTheDay(): void
    {
        $this->limitTo(1);

        $this->identifyAsPlayer(self::PHONE);
        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();

        $this->post('/api/player/identify', ['phone' => '+84912345678']);
        self::assertResponseIsSuccessful('The international spelling was not recognised.');
        self::assertSame(0, $this->decodeResponse()['spinsLeft']);

        $this->client->request('POST', self::SPIN_URI);

        self::assertResponseStatusCodeSame(Response::HTTP_TOO_MANY_REQUESTS);
    }

    /** Somebody else's day is their own. */
    public function testOnePersonsLimitDoesNotTouchAnother(): void
    {
        $this->limitTo(1);

        $this->identifyAsPlayer(self::PHONE);
        $this->client->request('POST', self::SPIN_URI);

        $this->identifyAsPlayer('0998887777');
        $this->client->request('POST', self::SPIN_URI);

        self::assertResponseIsSuccessful();
        self::assertSame(2, $this->spinCount());
    }

    // ------------------------------------------------- beside the other refusals

    /**
     * F23 R11. Both refusals apply to this request, and the session one wins
     * on purpose: a page whose identification has spun should be shown what
     * it won, not told to come back tomorrow.
     */
    public function testAnIdentificationThatHasSpunStillGetsTheConflict(): void
    {
        $this->limitTo(1);

        $this->identifyAsPlayer(self::PHONE);
        $this->client->request('POST', self::SPIN_URI);

        // No re-identification: this is the same identification spinning
        // twice, which is F20's case.
        $this->client->request('POST', self::SPIN_URI);

        self::assertResponseStatusCodeSame(Response::HTTP_CONFLICT);
    }

    /** F08 R16 still comes first: eligibility is not asked of a stranger. */
    public function testAnUnidentifiedVisitorIsStillForbiddenRatherThanRateLimited(): void
    {
        $this->limitTo(1);

        $this->client->request('POST', self::SPIN_URI);

        self::assertResponseStatusCodeSame(Response::HTTP_FORBIDDEN);
    }

    /** F23 R12: a stranger has no day to count. */
    public function testAnUnidentifiedVisitorIsToldNothingAboutTheLimit(): void
    {
        $this->limitTo(3);

        $this->client->request('GET', self::ME_URI);

        self::assertNull($this->decodeResponse()['player']);
        self::assertNull($this->decodeResponse()['spinsLeft']);
    }

    // --------------------------------------------------- what the player is told

    /**
     * F23 R18, R22. The player page is told about this person's day and
     * never about the campaign's rule.
     */
    public function testTheWheelNeverCarriesTheLimit(): void
    {
        $this->limitTo(3);

        $this->client->request('GET', '/api/wheel');

        $body = (string) $this->client->getResponse()->getContent();

        self::assertStringNotContainsString('dailySpinLimit', $body);
        self::assertStringNotContainsString('spinsLeft', $body);
    }

    /** F23 R13: known at the moment somebody is identified. */
    public function testIdentifyingReportsTheSpinsLeft(): void
    {
        $this->limitTo(2);
        $this->identifyAsPlayer(self::PHONE);
        $this->client->request('POST', self::SPIN_URI);

        $this->post('/api/player/identify', ['phone' => self::PHONE]);

        self::assertSame(1, $this->decodeResponse()['spinsLeft']);
    }

    /** F23 R13: and by registering, which may find an existing player. */
    public function testRegisteringReportsTheSpinsLeft(): void
    {
        $this->limitTo(2);
        $this->identifyAsPlayer(self::PHONE);
        $this->client->request('POST', self::SPIN_URI);

        // F08 R7: the same number again returns the player who already
        // exists, so this is somebody who has played today.
        $this->identifyAsPlayer(self::PHONE);

        self::assertSame(1, $this->decodeResponse()['spinsLeft']);
    }

    /** A number nobody has registered is nobody, and has no allowance. */
    public function testAnUnknownNumberIsToldNothing(): void
    {
        $this->limitTo(2);

        $this->post('/api/player/identify', ['phone' => '0900000001']);

        $payload = $this->decodeResponse();

        self::assertFalse($payload['known']);
        self::assertNull($payload['spinsLeft']);
    }

    // ------------------------------------------------------------- helpers

    /**
     * The container's entity manager, not the one captured in setUp: a few
     * requests in, the kernel has been rebooted and `$this->entityManager`
     * is managing nothing the next request will see. Flushing the campaign
     * through the stale one looked like it worked and changed no row.
     */
    private function limitTo(?int $limit): void
    {
        /*
         * F27 R29. The limit is the game's now, not the campaign's: each
         * promotion carries its own allowance and counts it separately
         * (R30).
         */
        $game = $this->entityManager->getRepository(Game::class)->find($this->game->getId());
        \assert($game instanceof Game);

        $game->setDailyLimit($limit);
        $this->entityManager->flush();
    }

    private function spinsLeft(): ?int
    {
        $this->client->request('GET', self::ME_URI);
        self::assertResponseIsSuccessful();

        $left = $this->decodeResponse()['spinsLeft'];
        self::assertTrue(null === $left || \is_int($left));

        /** @var int|null $left */
        return $left;
    }

    /** F27 R31: the shop's clock, read back from the row it lives on. */
    private function storeTimezone(): \DateTimeZone
    {
        $store = $this->entityManager->getRepository(Store::class)->findOneBy([]);
        \assert($store instanceof Store);

        return $store->getTimezoneAsZone();
    }

    private function startOfToday(): \DateTimeImmutable
    {
        $day = static::getContainer()->get(CampaignDay::class);
        \assert($day instanceof CampaignDay);

        return $day->startOfToday($this->storeTimezone());
    }

    /**
     * Spin has no setter for when it happened, deliberately — it is a record
     * of a moment. A test that needs yesterday therefore goes round the
     * entity rather than opening a door in it that production would then
     * have.
     */
    private function moveEverySpinTo(\DateTimeImmutable $when): void
    {
        $this->entityManager->getConnection()->executeStatement(
            'UPDATE spin SET spun_at = :when',
            ['when' => $when->format('Y-m-d H:i:s')],
        );

        $this->entityManager->clear();
    }

    private function spinCount(): int
    {
        return \count($this->entityManager->getRepository(Spin::class)->findAll());
    }

    /**
     * @return list<string|null>
     */
    private function rewardCodes(): array
    {
        $codes = array_map(
            static fn (Spin $spin): ?string => $spin->getRewardCode(),
            $this->entityManager->getRepository(Spin::class)->findAll(),
        );

        sort($codes);

        return $codes;
    }
}
