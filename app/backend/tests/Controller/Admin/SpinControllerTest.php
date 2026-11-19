<?php

declare(strict_types=1);

namespace App\Tests\Controller\Admin;

use App\Entity\Player;
use App\Repository\SpinRepository;
use App\Tests\Support\DatabaseWebTestCase;
use Symfony\Component\HttpFoundation\Response;

/**
 * F09 R13–R21: the whole spin log.
 */
final class SpinControllerTest extends DatabaseWebTestCase
{
    private const LOG_URI = '/api/admin/spins';

    // --------------------------------------------------------------- the guard

    /** F09 R20, with F07 R17 */
    public function testTheLogIsClosedToStrangers(): void
    {
        $this->client->request('GET', self::LOG_URI);

        self::assertResponseStatusCodeSame(Response::HTTP_UNAUTHORIZED);
    }

    /** F09 R20 — and nothing leaks in the body of the refusal */
    public function testTheRefusalCarriesNoPersonalData(): void
    {
        $this->givenSpins('0912345678', 1);

        $this->client->request('GET', self::LOG_URI);

        $body = (string) $this->client->getResponse()->getContent();

        self::assertStringNotContainsString('0912345678', $body);
    }

    // ------------------------------------------------------------- the whole log

    /**
     * F09 R13. The point of the module: one list, every player, which is the
     * question the per-player history cannot answer.
     */
    public function testItListsEverySpinWhoeverMadeIt(): void
    {
        $this->givenSpins('0912345678', 2);
        $this->givenSpins('0987654321', 3);

        $this->signInAsAdmin();
        $this->client->request('GET', self::LOG_URI);

        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('Content-Type', 'application/json');

        $body = $this->decodeResponse();

        self::assertCount(5, $body['spins']);
        self::assertSame(5, $body['total']);

        $phones = array_column(array_column($body['spins'], 'player'), 'phone');
        self::assertSame(['0987654321' => 3, '0912345678' => 2], array_count_values($phones));
    }

    /** F09 R14 */
    public function testEachRowCarriesThePrizeTheTimeAndThePlayer(): void
    {
        $this->givenSpins('0912345678', 1);

        $this->signInAsAdmin();
        $this->client->request('GET', self::LOG_URI);

        $spin = $this->decodeResponse()['spins'][0];

        self::assertSame(
            // F13 R25: the reward snapshot, the code and the claim ride
            // along with every log row now.
            // F27 R44 adds `game`: with two promotions in one log, "what
            // went out today" is ambiguous without saying which gave it.
            [
                'id', 'prizeName', 'spunAt', 'player', 'rewardType', 'rewardValue',
                'code', 'claimable', 'claimedAt', 'game',
            ],
            array_keys($spin),
        );
        self::assertNotSame('', $spin['prizeName']);
        self::assertSame(
            ['id', 'phone', 'firstName', 'lastName'],
            array_keys($spin['player']),
        );
        self::assertSame('0912345678', $spin['player']['phone']);
    }

    /**
     * F08 R24: the log is a list of prizes given away. A birthday on every
     * row of it is personal data travelling further than the screen needs.
     */
    public function testTheLogCarriesNoBirthdays(): void
    {
        $this->givenSpins('0912345678', 1);

        $this->signInAsAdmin();
        $this->client->request('GET', self::LOG_URI);

        $body = (string) $this->client->getResponse()->getContent();

        self::assertStringNotContainsString('birthday', $body);
        self::assertStringNotContainsString('1994', $body);
    }

    /** F09 R13 — newest first */
    public function testItIsNewestFirst(): void
    {
        $this->givenSpins('0912345678', 4);

        $this->signInAsAdmin();
        $this->client->request('GET', self::LOG_URI);

        $ids = array_column($this->decodeResponse()['spins'], 'id');

        // Asserted on the ids: several spins land in the same second, so a
        // timestamp alone would leave their order to the database.
        $descending = $ids;
        rsort($descending);

        self::assertSame($descending, $ids);
        self::assertCount(4, $ids);
    }

    /**
     * F09 R15. The deletion rule and this one are the same decision seen
     * from two ends: the person disappears, the spin does not. A log that
     * quietly omits prizes given away is worse than useless.
     */
    public function testASpinWhosePlayerWasDeletedIsStillListed(): void
    {
        $this->givenSpins('0912345678', 1);

        $player = $this->entityManager->getRepository(Player::class)->findOneBy([]);
        self::assertInstanceOf(Player::class, $player);
        $this->entityManager->remove($player);
        $this->entityManager->flush();
        $this->entityManager->clear();

        $this->signInAsAdmin();
        $this->client->request('GET', self::LOG_URI);

        $body = $this->decodeResponse();

        self::assertCount(1, $body['spins'], 'An anonymous spin must not vanish from the log.');
        self::assertArrayHasKey('player', $body['spins'][0], 'The page reads one shape either way.');
        self::assertNull($body['spins'][0]['player']);
        self::assertNotSame('', $body['spins'][0]['prizeName'], 'The prize still left the shop.');
    }

    /**
     * F09 R17. The log reads the spin's own snapshot (F02 R10), so tidying
     * the wheel up does not rewrite what went out last week.
     */
    public function testItStillNamesAPrizeThatHasSinceBeenDeleted(): void
    {
        $this->givenSpins('0912345678', 1);

        $this->signInAsAdmin();

        $this->client->request('GET', self::LOG_URI);
        $won = $this->decodeResponse()['spins'][0]['prizeName'];

        $this->put($this->wheelUri(), [
            'prizes' => [
                ['name' => 'Something else', 'probability' => 50, 'rewardId' => $this->aRewardId()],
                ['name' => 'Another thing', 'probability' => 50, 'rewardId' => $this->aRewardId()],
            ],
        ]);
        self::assertResponseIsSuccessful();

        $this->client->request('GET', self::LOG_URI);

        self::assertSame($won, $this->decodeResponse()['spins'][0]['prizeName']);
    }

    // ------------------------------------------------------------- the filter

    /**
     * F09 R18.
     *
     * The fragment has a `1` in it on purpose. Since F16 R7 the same box
     * also searches codes, and the code alphabet excludes `1` (F13 R18), so
     * a filter containing one cannot match a generated code by luck and
     * this test cannot flake once in a few hundred thousand runs.
     */
    public function testItFiltersOnAnyPartOfTheNumber(): void
    {
        $this->givenSpins('0912345678', 2);
        $this->givenSpins('0987654321', 3);

        $this->signInAsAdmin();
        $this->client->request('GET', self::LOG_URI.'?search=12');

        self::assertResponseIsSuccessful();

        $body = $this->decodeResponse();

        self::assertCount(2, $body['spins']);
        self::assertSame(2, $body['total']);

        foreach ($body['spins'] as $spin) {
            self::assertSame('0912345678', $spin['player']['phone']);
        }
    }

    public function testAFilterMatchingNothingIsAnEmptyLog(): void
    {
        $this->givenSpins('0912345678', 2);

        $this->signInAsAdmin();
        $this->client->request('GET', self::LOG_URI.'?search=0000');

        self::assertResponseIsSuccessful();
        self::assertSame([], $this->decodeResponse()['spins']);
        self::assertSame(0, $this->decodeResponse()['total']);
    }

    public function testAnEmptyFilterListsEverything(): void
    {
        $this->givenSpins('0912345678', 1);
        $this->givenSpins('0987654321', 1);

        $this->signInAsAdmin();
        $this->client->request('GET', self::LOG_URI.'?search=');

        self::assertSame(2, $this->decodeResponse()['total']);
    }

    /**
     * The one case where R15 does not apply: an anonymous spin has no number
     * to match, and the admin has asked a question it cannot answer.
     */
    public function testFilteringByNumberExcludesTheAnonymousSpins(): void
    {
        $this->givenSpins('0912345678', 1);
        $this->givenSpins('0987654321', 1);

        $player = $this->entityManager->getRepository(Player::class)
            ->findOneBy(['phone' => '0987654321']);
        self::assertInstanceOf(Player::class, $player);
        $this->entityManager->remove($player);
        $this->entityManager->flush();
        $this->entityManager->clear();

        $this->signInAsAdmin();

        // Unfiltered, both are there.
        $this->client->request('GET', self::LOG_URI);
        self::assertSame(2, $this->decodeResponse()['total']);

        // Filtered, only the one with a number.
        $this->client->request('GET', self::LOG_URI.'?search=12');
        self::assertSame(1, $this->decodeResponse()['total']);
    }

    /** A stray wildcard must match itself, not every spin. */
    public function testAWildcardInTheFilterIsTakenLiterally(): void
    {
        $this->givenSpins('0912345678', 2);

        $this->signInAsAdmin();
        $this->client->request('GET', self::LOG_URI.'?search=%');

        self::assertResponseIsSuccessful();
        self::assertSame(0, $this->decodeResponse()['total']);
    }

    public function testAnEmptyLogIsAnEmptyListAndNotAnError(): void
    {
        $this->signInAsAdmin();
        $this->client->request('GET', self::LOG_URI);

        self::assertResponseIsSuccessful();
        self::assertSame([], $this->decodeResponse()['spins']);
        self::assertSame(0, $this->decodeResponse()['total']);
    }

    // --------------------------------------------------------------- the cap

    /**
     * F09 R16, R21. Both halves, because a cap that lies is worse than no
     * cap: the rows are limited, and the total is the real number, which is
     * what lets the page say "the most recent 200 of 1,432".
     */
    public function testACappedLogReportsTheTrueTotal(): void
    {
        $this->signInAsAdmin();

        // The cap itself is 200 and writing 201 spins through the API would
        // make this test take minutes, so the repository is asked directly
        // with a cap of 2 over 5 real rows. The rule under test is that the
        // count is independent of the page, not what the constant happens
        // to be.
        $this->givenSpins('0912345678', 5);

        $repository = static::getContainer()->get(SpinRepository::class);
        self::assertInstanceOf(SpinRepository::class, $repository);

        self::assertCount(2, $repository->listRecent(null, null, 2), 'The page must be capped.');
        self::assertSame(5, $repository->countMatching(), 'The total must not be.');
    }

    /** F09 R16 — the cap is a constant the page can rely on */
    public function testTheLogIsCappedAtTwoHundred(): void
    {
        self::assertSame(200, SpinRepository::LOG_LIMIT);
    }

    /**
     * Registers a player, spins for them, then clears the session so the
     * next call starts from nobody.
     *
     * Driven through the API rather than by inserting rows, so the spins are
     * wired to their player exactly as the application wires them.
     */
    private function givenSpins(string $phone, int $spins): void
    {
        $this->post('/api/player/register', [
            'phone' => $phone,
            'firstName' => 'Anh',
            'lastName' => 'Le',
            'birthday' => '1994-03-12',
        ]);
        self::assertResponseIsSuccessful();

        for ($i = 0; $i < $spins; ++$i) {
            $this->spinOnceMore($phone);
        }

        $this->post('/api/player/forget');
    }
}
