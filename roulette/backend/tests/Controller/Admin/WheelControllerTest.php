<?php

declare(strict_types=1);

namespace App\Tests\Controller\Admin;

use App\Entity\Prize;
use App\Entity\Wheel;
use App\Tests\Support\DatabaseWebTestCase;
use Symfony\Component\HttpFoundation\Response;

/**
 * F01 end to end through the kernel and the real database: the rules that
 * only mean something once data is actually stored.
 */
final class WheelControllerTest extends DatabaseWebTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // F07 R17: these routes need a session now.
        $this->signInAsAdmin();
    }

    private const URI = '/api/admin/wheel';

    // ---------------------------------------------------------------- GET

    /** F01 R2 */
    public function testItCreatesTheDefaultWheelOnFirstRead(): void
    {
        $this->client->request('GET', self::URI);

        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('Content-Type', 'application/json');

        $wheel = $this->decodeResponse();

        self::assertCount(6, $wheel['prizes']);
        self::assertSame(100, $wheel['totalProbability']);
        self::assertSame(40, $wheel['prizes'][0]['probability']);

        // F26 R12: no label travels with a slice. The page resolves it from
        // the reward it already lists, so sending one here would be a second
        // copy that the PUT then has to ignore.
        self::assertArrayNotHasKey('name', $wheel['prizes'][0]);
    }

    public function testTheDefaultWheelIsOrderedAndColoured(): void
    {
        $this->client->request('GET', self::URI);

        $prizes = $this->decodeResponse()['prizes'];

        self::assertSame([0, 1, 2, 3, 4, 5], array_column($prizes, 'position'));

        $colours = array_column($prizes, 'colour');
        self::assertCount(6, array_unique($colours), 'Neighbouring slices must differ.');

        foreach ($colours as $colour) {
            self::assertMatchesRegularExpression('/^#[0-9A-F]{6}$/', $colour);
        }
    }

    /** F01 R2 — exactly one wheel */
    public function testReadingTwiceDoesNotCreateASecondWheel(): void
    {
        $this->client->request('GET', self::URI);
        $first = $this->decodeResponse();

        $this->client->request('GET', self::URI);
        $second = $this->decodeResponse();

        self::assertSame($first['id'], $second['id']);
        self::assertSame(1, $this->countRows('wheel'));
    }

    // ---------------------------------------------------------------- PUT

    /**
     * F26 R13. There is no name to change any more, and a page still sending
     * one saves anyway rather than being refused — an admin holding the bundle
     * they loaded this morning must not be locked out of saving.
     */
    public function testANameSentWithAPrizeIsIgnoredRatherThanRefused(): void
    {
        $prizes = $this->currentPrizes();
        $prizes[0]['name'] = 'Better luck next time';

        $this->put(self::URI, ['prizes' => $this->asPayload($prizes)]);

        self::assertResponseIsSuccessful();

        $this->client->request('GET', self::URI);
        self::assertArrayNotHasKey('name', $this->decodeResponse()['prizes'][0]);
    }

    /** F01 R11 */
    public function testSavingKeepsPrizeIdsStable(): void
    {
        $before = $this->currentPrizes();
        $idsBefore = array_column($before, 'id');

        $this->put(self::URI, ['prizes' => $this->asPayload($before)]);

        self::assertResponseIsSuccessful();
        self::assertSame($idsBefore, array_column($this->decodeResponse()['prizes'], 'id'));
    }

    /** F01 R7 — the parking-offset reorder must survive the unique constraint */
    public function testItReordersPrizes(): void
    {
        $prizes = $this->currentPrizes();
        $reversed = array_reverse($prizes);

        $this->put(self::URI, ['prizes' => $this->asPayload($reversed)]);

        self::assertResponseIsSuccessful();

        $this->client->request('GET', self::URI);
        $saved = $this->decodeResponse()['prizes'];

        self::assertSame([0, 1, 2, 3, 4, 5], array_column($saved, 'position'));
        // By reward, since F26 left a slice with nothing else of its own.
        self::assertSame(
            array_column($reversed, 'rewardId'),
            array_column($saved, 'rewardId'),
            'The saved order should be the order that was sent.',
        );
    }

    /** F01 R14 — colour follows position, so reordering recolours */
    public function testReorderingRecoloursTheWheel(): void
    {
        $prizes = $this->currentPrizes();
        $firstColour = $prizes[0]['colour'];
        $lastReward = $prizes[5]['rewardId'];

        $this->put(self::URI, ['prizes' => $this->asPayload(array_reverse($prizes))]);

        $saved = $this->decodeResponse()['prizes'];

        self::assertSame($lastReward, $saved[0]['rewardId']);
        self::assertSame($firstColour, $saved[0]['colour'], 'Position 0 keeps position 0\'s colour.');
    }

    public function testItAddsANewPrizeAndGivesItAnId(): void
    {
        $prizes = $this->asPayload($this->currentPrizes());
        $prizes[0]['probability'] = 35;
        $rewardId = $this->aRewardId('Mystery box');
        $prizes[] = ['probability' => 5, 'rewardId' => $rewardId];

        $this->put(self::URI, ['prizes' => $prizes]);

        self::assertResponseIsSuccessful();

        $saved = $this->decodeResponse()['prizes'];
        self::assertCount(7, $saved);
        self::assertSame($rewardId, $saved[6]['rewardId']);
        self::assertIsInt($saved[6]['id']);
    }

    public function testItDeletesARemovedPrizeAndKeepsPositionsContiguous(): void
    {
        $prizes = $this->asPayload($this->currentPrizes());
        array_splice($prizes, 2, 1);          // drop "10% off"
        $prizes[0]['probability'] = 55;       // keep the total at 100

        $this->put(self::URI, ['prizes' => $prizes]);

        self::assertResponseIsSuccessful();

        $saved = $this->decodeResponse()['prizes'];
        self::assertCount(5, $saved);
        self::assertSame([0, 1, 2, 3, 4], array_column($saved, 'position'));
        self::assertSame(5, $this->countRows('prize'), 'The row should be gone, not orphaned.');
    }

    public function testItUpdatesTheTimestampOnSave(): void
    {
        $this->client->request('GET', self::URI);
        $before = $this->decodeResponse();

        $prizes = $this->asPayload($this->currentPrizes());
        $prizes[0]['name'] = 'Changed';
        $this->put(self::URI, ['prizes' => $prizes]);

        self::assertGreaterThanOrEqual(
            $before['updatedAt'],
            $this->decodeResponse()['updatedAt'],
        );
    }

    // ----------------------------------------------------------- rejection

    /** F01 R8, R9, R12 */
    public function testItRejectsATotalThatIsNot100(): void
    {
        $prizes = $this->asPayload($this->currentPrizes());
        $prizes[0]['probability'] = 37;

        $this->put(self::URI, ['prizes' => $prizes]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertResponseHeaderSame('Content-Type', 'application/json');

        $error = $this->decodeResponse()['error'];
        self::assertSame(422, $error['status']);
        self::assertSame('prizes', $error['violations'][0]['field']);
        self::assertStringContainsString('97', $error['violations'][0]['message']);
    }

    /** F01 R10 — a rejected save must change nothing */
    public function testARejectedSaveLeavesTheStoredWheelUntouched(): void
    {
        $original = $this->currentPrizes();

        $broken = $this->asPayload($original);
        $broken[0]['probability'] = 37;

        $this->put(self::URI, ['prizes' => $broken]);
        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);

        $this->client->request('GET', self::URI);
        $after = $this->decodeResponse();

        self::assertSame(
            array_column($original, 'rewardId'),
            array_column($after['prizes'], 'rewardId'),
        );
        self::assertSame(array_column($original, 'probability'), array_column($after['prizes'], 'probability'));
        self::assertSame(100, $after['totalProbability']);
    }

    /** F01 R10 — including a rejection that only surfaces while writing */
    public function testASaveReferencingAnUnknownPrizeChangesNothing(): void
    {
        $original = $this->currentPrizes();

        $payload = $this->asPayload($original);
        $payload[1]['id'] = 99999;

        $this->put(self::URI, ['prizes' => $payload]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('prizes[1].id', $this->decodeResponse()['error']['violations'][0]['field']);

        $this->client->request('GET', self::URI);
        self::assertSame(
            array_column($original, 'name'),
            array_column($this->decodeResponse()['prizes'], 'name'),
        );
    }

    /** F01 R1 */
    public function testItRejectsFewerThanTwoPrizes(): void
    {
        $this->put(self::URI, ['prizes' => [['name' => 'Everyone wins', 'probability' => 100, 'rewardId' => $this->aRewardId()]]]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
    }

    /** F01 R1 */
    public function testItRejectsMoreThanTwelvePrizes(): void
    {
        $prizes = [];

        for ($i = 0; $i < 13; ++$i) {
            $prizes[] = ['name' => 'Prize '.$i, 'probability' => 0 === $i ? 88 : 1, 'rewardId' => $this->aRewardId()];
        }

        $this->put(self::URI, ['prizes' => $prizes]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
    }

    public function testItRejectsABodyThatIsNotJson(): void
    {
        $this->client->request(
            'PUT',
            self::URI,
            server: ['CONTENT_TYPE' => 'application/json'],
            content: 'not json at all',
        );

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertResponseHeaderSame('Content-Type', 'application/json');
    }

    public function testAnInvalidSaveDoesNotCreateAWheelAsASideEffect(): void
    {
        self::assertSame(0, $this->countRows('wheel'));

        $this->put(self::URI, ['prizes' => [['name' => 'Only one', 'probability' => 100, 'rewardId' => $this->aRewardId()]]]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame(0, $this->countRows('wheel'), 'A rejected request should store nothing at all.');
    }

    // ------------------------------------------------------------- content

    /** F01 R16 — stored verbatim; escaping is the renderer's job */
    /**
     * F01 R16, F26 R18.
     *
     * Asserted against the player's wheel rather than the admin's, because
     * since F26 the admin's payload has no label in it: what reaches a
     * browser as text is the reward's name, so that is where the rule has to
     * be proved. The second slice, not the first, which is the losing one.
     */
    public function testARewardNameContainingMarkupReachesTheWheelVerbatim(): void
    {
        $prizes = $this->asPayload($this->currentPrizes());
        $prizes[1]['rewardId'] = $this->aRewardId('<script>alert(1)</script>');

        $this->put(self::URI, ['prizes' => $prizes]);
        self::assertResponseIsSuccessful();

        $this->client->request('GET', '/api/wheel');

        self::assertSame(
            '<script>alert(1)</script>',
            $this->decodeResponse()['prizes'][1]['name'],
        );
    }

    public function testItAcceptsTheBoundaryValues(): void
    {
        $this->put(self::URI, ['prizes' => [
            [
                'probability' => Wheel::REQUIRED_TOTAL_PROBABILITY - 1,
                'rewardId' => $this->aRewardId(),
            ],
            ['probability' => Prize::MIN_PROBABILITY, 'rewardId' => $this->aRewardId()],
        ]]);

        self::assertResponseIsSuccessful();
    }

    // -------------------------------------------------------------- helpers

    /**
     * @return list<array<string, mixed>>
     */
    private function currentPrizes(): array
    {
        $this->client->request('GET', self::URI);
        self::assertResponseIsSuccessful();

        return $this->decodeResponse()['prizes'];
    }

    /**
     * Strips the read-only fields, leaving what a client would send back.
     *
     * @param list<array<string, mixed>> $prizes
     *
     * @return list<array<string, mixed>>
     */
    private function asPayload(array $prizes): array
    {
        return array_map(
            static fn (array $prize): array => [
                'id' => $prize['id'],
                'probability' => $prize['probability'],
                // F13 R7: a slice still has to say what it gives away when
                // it is sent back unchanged.
                'rewardId' => $prize['rewardId'],
            ],
            $prizes,
        );
    }

    private function countRows(string $table): int
    {
        return (int) $this->entityManager
            ->getConnection()
            ->fetchOne(sprintf('SELECT COUNT(*) FROM %s', $table));
    }
}
