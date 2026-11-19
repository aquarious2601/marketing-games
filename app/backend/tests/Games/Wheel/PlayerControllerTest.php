<?php

declare(strict_types=1);

namespace App\Tests\Games\Wheel;

use App\Entity\Spin;
use App\Tests\Support\DatabaseWebTestCase;
use Symfony\Component\HttpFoundation\Response;

/**
 * F02 through the kernel and the real database.
 */
final class PlayerControllerTest extends DatabaseWebTestCase
{
    private const WHEEL_URI = '/api/wheel';
    private const SPIN_URI = '/api/spin';

    // --------------------------------------------------------- GET /api/wheel

    /** F02 R1, R3 */
    public function testItServesTheWheelToAPlayer(): void
    {
        $this->client->request('GET', self::WHEEL_URI);

        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('Content-Type', 'application/json');

        $prizes = $this->decodeResponse()['prizes'];

        self::assertCount(6, $prizes);
        // F26 R1, R5: the first slice is the losing one and reads the losing
        // reward's name. Before F26 it had a label of its own, "Try again".
        self::assertSame('Maybe next time', $prizes[0]['name']);
        self::assertSame([0, 1, 2, 3, 4, 5], array_column($prizes, 'position'));
    }

    /**
     * F02 R2. The single most important assertion in this feature: the odds
     * must not reach the player, in any field, by any name.
     */
    public function testItNeverSendsTheOddsToAPlayer(): void
    {
        $this->client->request('GET', self::WHEEL_URI);

        $body = (string) $this->client->getResponse()->getContent();

        self::assertStringNotContainsString('probability', $body);
        self::assertStringNotContainsString('odds', $body);
        self::assertStringNotContainsString('weight', $body);

        foreach ($this->decodeResponse()['prizes'] as $prize) {
            self::assertSame(['id', 'name', 'position', 'colour'], array_keys($prize));
        }

        // The default wheel's probabilities are 40/25/15/10/7/3. None of those
        // numbers should be anywhere in the payload.
        self::assertStringNotContainsString(':40', $body);
        self::assertStringNotContainsString(':25', $body);
    }

    public function testEachPrizeCarriesAColourForTheSlice(): void
    {
        $this->client->request('GET', self::WHEEL_URI);

        foreach ($this->decodeResponse()['prizes'] as $prize) {
            self::assertMatchesRegularExpression('/^#[0-9A-F]{6}$/', $prize['colour']);
        }
    }

    /** F04 section 8 — one request serves the whole player page */
    public function testTheWheelCarriesTheBranding(): void
    {
        $this->client->request('GET', self::WHEEL_URI);

        $store = $this->decodeResponse()['branding'];

        /*
         * F27 R11. The shop's own fields come first and the game's two
         * follow, which is why the order changed and the shape did not: the
         * player page reads one header and has no use for the distinction.
         */
        self::assertSame(
            // F13 R28 adds the shop's currency and its symbol.
            ['companyName', 'theme', 'currency', 'currencySymbol', 'logoUrl', 'campaignName', 'tagline'],
            array_keys($store),
        );
        self::assertSame('One spin, one prize. Good luck.', $store['tagline']);
        self::assertSame('plain', $store['theme']);
        self::assertNull($store['logoUrl']);
    }

    public function testTheBrandingReachesThePlayerOnceSaved(): void
    {
        // Configuring needs an account (F07 R17); reading it back does not,
        // which is the half this test is about.
        $this->signInAsAdmin();

        $this->client->request(
            'PUT',
            '/api/admin/store',
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(
                ['companyName' => 'AA Store', 'theme' => 'christmas'],
                \JSON_THROW_ON_ERROR,
            ),
        );
        self::assertResponseIsSuccessful();

        $this->client->request('GET', self::WHEEL_URI);
        $store = $this->decodeResponse()['branding'];

        self::assertSame('AA Store', $store['companyName']);
        self::assertSame('christmas', $store['theme']);
        // F27 R11: the name on the player page is the game's, not the shop's.
        self::assertSame('Test campaign', $store['campaignName']);
    }

    /** F04 must not undo F02 R2 */
    public function testAddingBrandingDidNotLeakTheOdds(): void
    {
        $this->client->request('GET', self::WHEEL_URI);

        self::assertStringNotContainsString(
            'probability',
            (string) $this->client->getResponse()->getContent(),
        );
    }

    // -------------------------------------------------------- POST /api/spin

    /** F02 R4 */
    public function testItSpinsAndReturnsAPrizeFromTheWheel(): void
    {
        $this->identifyAsPlayer();

        $this->client->request('GET', self::WHEEL_URI);
        $names = array_column($this->decodeResponse()['prizes'], 'name');

        $this->client->request('POST', self::SPIN_URI);

        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('Content-Type', 'application/json');

        $body = $this->decodeResponse();

        self::assertContains($body['prize']['name'], $names);
        self::assertIsInt($body['prize']['position']);
        self::assertArrayHasKey('spunAt', $body);
    }

    /** F02 R2 — the spin response must not leak the odds either */
    public function testTheSpinResponseCarriesNoProbability(): void
    {
        $this->identifyAsPlayer();

        $this->client->request('POST', self::SPIN_URI);

        self::assertStringNotContainsString(
            'probability',
            (string) $this->client->getResponse()->getContent(),
        );
        self::assertSame(
            ['id', 'name', 'position', 'colour'],
            array_keys($this->decodeResponse()['prize']),
        );
    }

    /** F02 R9, R10 */
    public function testItRecordsTheSpinWithASnapshotOfThePrize(): void
    {
        $this->identifyAsPlayer();

        $this->client->request('POST', self::SPIN_URI);
        $won = $this->decodeResponse()['prize'];

        self::assertSame(1, $this->countRows('spin'));

        $spin = $this->entityManager->getRepository(Spin::class)->findOneBy([]);
        self::assertInstanceOf(Spin::class, $spin);

        self::assertSame($won['name'], $spin->getPrizeName());
        self::assertGreaterThanOrEqual(1, $spin->getPrizeProbability());
        self::assertNotNull($spin->getPrize());
        self::assertSame($won['id'], $spin->getPrize()?->getId());
    }

    public function testEverySpinAddsARow(): void
    {
        $this->identifyAsPlayer();
        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();

        // Identified again before each of the rest, because one
        // identification buys one spin now (F20 R1).
        for ($i = 0; $i < 4; ++$i) {
            $this->spinOnceMore();
        }

        self::assertSame(5, $this->countRows('spin'));
    }

    /**
     * F02 R16, F20 R11. Still unlimited for a *person* — they type their
     * number in again, which is F10 R6 — and no longer unlimited for one
     * identification, which is the test below.
     */
    public function testAPlayerMaySpinAgainByIdentifyingAgain(): void
    {
        $this->identifyAsPlayer();

        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();

        $this->spinOnceMore();

        self::assertSame(2, $this->countRows('spin'));
    }

    /**
     * F20 R2. The reported bug: a reload used to leave a working Spin
     * button, and with F16 issuing a code on every win that made a reload a
     * voucher printer.
     */
    public function testASecondSpinFromOneIdentificationIsRefused(): void
    {
        $this->identifyAsPlayer();

        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();

        $this->client->request('POST', self::SPIN_URI);

        self::assertResponseStatusCodeSame(Response::HTTP_CONFLICT);
        self::assertSame(1, $this->countRows('spin'), 'A refused spin was recorded anyway.');
    }

    /** F20 R2: and nothing was drawn, so no second code exists either. */
    public function testARefusedSecondSpinMintsNoCode(): void
    {
        $this->identifyAsPlayer();

        $this->client->request('POST', self::SPIN_URI);
        $first = $this->decodeResponse()['reward']['code'];

        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseStatusCodeSame(Response::HTTP_CONFLICT);

        $codes = $this->entityManager->getConnection()
            ->fetchFirstColumn('SELECT reward_code FROM spin WHERE reward_code IS NOT NULL');

        self::assertSame(array_filter([$first]), array_values($codes));
    }

    /**
     * F02 R11. The whole reason the snapshot exists: an admin tidying up the
     * wheel must not rewrite what happened last week.
     */
    public function testDeletingAPrizeLeavesPastSpinsIntact(): void
    {
        $this->identifyAsPlayer();

        $this->client->request('POST', self::SPIN_URI);
        $won = $this->decodeResponse()['prize'];

        // Replace the wheel with two prizes that do not include the winner.
        // Editing the wheel needs an account now (F07 R17).
        $this->signInAsAdmin();

        $this->client->request(
            'PUT',
            $this->wheelUri(),
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode([
                'prizes' => [
                    ['name' => 'Something else', 'probability' => 50, 'rewardId' => $this->aRewardId()],
                    ['name' => 'Another thing', 'probability' => 50, 'rewardId' => $this->aRewardId()],
                ],
            ], \JSON_THROW_ON_ERROR),
        );
        self::assertResponseIsSuccessful();

        $this->entityManager->clear();

        self::assertSame(1, $this->countRows('spin'), 'The spin must survive the prize being deleted.');

        $spin = $this->entityManager->getRepository(Spin::class)->findOneBy([]);
        self::assertInstanceOf(Spin::class, $spin);

        self::assertSame($won['name'], $spin->getPrizeName(), 'The snapshot must still name the prize.');
        self::assertNull($spin->getPrize(), 'Only the link should be lost.');
    }

    public function testSpinningCreatesTheDefaultWheelWhenNoneExists(): void
    {
        $this->identifyAsPlayer();

        self::assertSame(0, $this->countRows('wheel'));

        $this->client->request('POST', self::SPIN_URI);

        self::assertResponseIsSuccessful();
        self::assertSame(1, $this->countRows('wheel'));
    }

    public function testTheWheelCannotBeSpunWithGet(): void
    {
        $this->client->request('GET', self::SPIN_URI);

        self::assertResponseStatusCodeSame(Response::HTTP_METHOD_NOT_ALLOWED);
        self::assertSame(0, $this->countRows('spin'));
    }

    private function countRows(string $table): int
    {
        return (int) $this->entityManager
            ->getConnection()
            ->fetchOne(sprintf('SELECT COUNT(*) FROM %s', $table));
    }
}
