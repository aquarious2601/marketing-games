<?php

declare(strict_types=1);

namespace App\Tests\Controller\Admin;

use App\Entity\Player;
use App\Repository\PlayerRepository;
use App\Tests\Support\DatabaseWebTestCase;
use Symfony\Component\HttpFoundation\Response;

/**
 * F08 R20–R23: what the admin can see of the players.
 */
final class PlayerControllerTest extends DatabaseWebTestCase
{
    private const LIST_URI = '/api/admin/players';

    // --------------------------------------------------------------- the guard

    /**
     * F08 R23 together with F07 R17. This is the only screen in the project
     * that puts personal data on a page, so the firewall covering it is worth
     * asserting first rather than last.
     */
    public function testTheListIsClosedToStrangers(): void
    {
        $this->client->request('GET', self::LIST_URI);

        self::assertResponseStatusCodeSame(Response::HTTP_UNAUTHORIZED);
    }

    /** F08 R23 */
    public function testOnePlayerIsClosedToStrangers(): void
    {
        $id = $this->givenAPlayer();

        $this->client->request('GET', self::LIST_URI.'/'.$id);

        self::assertResponseStatusCodeSame(Response::HTTP_UNAUTHORIZED);
    }

    /** F08 R23 — and nothing leaks in the body of the refusal */
    public function testTheRefusalCarriesNoPersonalData(): void
    {
        $this->givenAPlayer();

        $this->client->request('GET', self::LIST_URI);

        $body = (string) $this->client->getResponse()->getContent();

        self::assertStringNotContainsString('0912345678', $body);
        self::assertStringNotContainsString('Anh', $body);
    }

    // --------------------------------------------------- GET /api/admin/players

    /** F08 R20 */
    public function testItListsThePlayersWithTheirSpinCounts(): void
    {
        $this->givenAPlayer('0912345678', 'Anh', 'Le', spins: 2);
        $this->givenAPlayer('0987654321', 'Binh', 'Tran', spins: 0);

        $this->signInAsAdmin();
        $this->client->request('GET', self::LIST_URI);

        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('Content-Type', 'application/json');

        $body = $this->decodeResponse();

        self::assertSame(2, $body['total']);
        self::assertCount(2, $body['players']);

        $byPhone = array_column($body['players'], null, 'phone');

        self::assertSame(2, $byPhone['0912345678']['spinCount']);
        self::assertSame(0, $byPhone['0987654321']['spinCount']);
    }

    /** F08 R20 — the admin sees everything that was collected */
    public function testTheListCarriesEveryStoredField(): void
    {
        $this->givenAPlayer();

        $this->signInAsAdmin();
        $this->client->request('GET', self::LIST_URI);

        self::assertSame(
            ['id', 'phone', 'firstName', 'lastName', 'birthday', 'createdAt', 'spinCount'],
            array_keys($this->decodeResponse()['players'][0]),
        );
    }

    /** A birthday is a calendar date, so it travels as one and not as an instant. */
    public function testTheBirthdayTravelsAsADateWithNoTimezone(): void
    {
        $this->givenAPlayer();

        $this->signInAsAdmin();
        $this->client->request('GET', self::LIST_URI);

        self::assertSame('1994-03-12', $this->decodeResponse()['players'][0]['birthday']);
    }

    public function testAnEmptyTableIsAnEmptyListAndNotAnError(): void
    {
        $this->signInAsAdmin();
        $this->client->request('GET', self::LIST_URI);

        self::assertResponseIsSuccessful();
        self::assertSame(0, $this->decodeResponse()['total']);
        self::assertSame([], $this->decodeResponse()['players']);
    }

    // ------------------------------------------------------------- the filter

    /**
     * F08 R21. The admin at a counter is reading the last four digits off a
     * receipt, not retyping the whole number.
     */
    public function testItFiltersOnAnyPartOfTheNumber(): void
    {
        $this->givenAPlayer('0912345678', 'Anh');
        $this->givenAPlayer('0987654321', 'Binh');

        $this->signInAsAdmin();

        $this->client->request('GET', self::LIST_URI.'?search=5678');

        self::assertResponseIsSuccessful();
        self::assertSame(1, $this->decodeResponse()['total']);
        self::assertSame('0912345678', $this->decodeResponse()['players'][0]['phone']);
    }

    /**
     * F19 section 5: the filter is deliberately untouched by F19, and this
     * is what that buys. The row holds the number as its owner typed it, so
     * staff type what is on the receipt in front of them and find it — which
     * a design that rewrote every number into `+33…` would have broken.
     */
    public function testItStillFindsAFrenchNumberByItsLocalForm(): void
    {
        $this->givenAPlayer('0614856240', 'Anh');

        $this->signInAsAdmin();

        $this->client->request('GET', self::LIST_URI.'?search=0614');

        self::assertResponseIsSuccessful();
        self::assertSame(1, $this->decodeResponse()['total']);
        self::assertSame('0614856240', $this->decodeResponse()['players'][0]['phone']);
    }

    public function testItFiltersOnTheMiddleOfTheNumber(): void
    {
        $this->givenAPlayer('0912345678');

        $this->signInAsAdmin();
        $this->client->request('GET', self::LIST_URI.'?search=234');

        self::assertSame(1, $this->decodeResponse()['total']);
    }

    public function testAFilterMatchingNothingIsAnEmptyList(): void
    {
        $this->givenAPlayer('0912345678');

        $this->signInAsAdmin();
        $this->client->request('GET', self::LIST_URI.'?search=0000');

        self::assertResponseIsSuccessful();
        self::assertSame(0, $this->decodeResponse()['total']);
    }

    /**
     * F09 R21. `total` was the length of the returned rows until F09, so a
     * shop with more players than the cap would have read the cap forever.
     * Checked against the repository's own count rather than against a
     * magic number, so the rule holds whatever the cap becomes.
     */
    public function testTheTotalIsTheNumberThatMatchNotTheNumberReturned(): void
    {
        $this->givenAPlayer('0912345678');
        $this->givenAPlayer('0987654321');
        $this->givenAPlayer('0911111111');

        $this->signInAsAdmin();

        $this->client->request('GET', self::LIST_URI);
        self::assertSame(3, $this->decodeResponse()['total']);

        $this->client->request('GET', self::LIST_URI.'?search=5678');
        self::assertSame(1, $this->decodeResponse()['total'], 'The total must follow the filter.');

        $repository = static::getContainer()->get(PlayerRepository::class);
        self::assertInstanceOf(PlayerRepository::class, $repository);
        self::assertSame(3, $repository->countMatching());
        self::assertSame(1, $repository->countMatching('5678'));
    }

    public function testAnEmptyFilterListsEverybody(): void
    {
        $this->givenAPlayer('0912345678');
        $this->givenAPlayer('0987654321');

        $this->signInAsAdmin();
        $this->client->request('GET', self::LIST_URI.'?search=');

        self::assertSame(2, $this->decodeResponse()['total']);
    }

    /**
     * A LIKE wildcard typed into the filter must match itself. Without the
     * escaping, a stray `%` lists every player, which looks like the filter
     * is broken rather than like it matched nothing.
     */
    public function testAWildcardInTheFilterIsTakenLiterally(): void
    {
        $this->givenAPlayer('0912345678');

        $this->signInAsAdmin();
        $this->client->request('GET', self::LIST_URI.'?search=%');

        self::assertResponseIsSuccessful();
        self::assertSame(0, $this->decodeResponse()['total']);
    }

    // ----------------------------------------------- GET /api/admin/players/id

    /** F08 R22 */
    public function testItShowsOnePlayerWithTheirSpinHistory(): void
    {
        $id = $this->givenAPlayer(spins: 3);

        $this->signInAsAdmin();
        $this->client->request('GET', self::LIST_URI.'/'.$id);

        self::assertResponseIsSuccessful();

        $body = $this->decodeResponse();

        self::assertSame('0912345678', $body['player']['phone']);
        self::assertSame(3, $body['player']['spinCount']);

        // F31 R13. Three plays, and however many of them won: the wheel
        // decides that, and what this asserts is that the two numbers are
        // about the same three spins.
        self::assertSame(3, $body['played']);
        self::assertCount($body['won'], $body['wins']);
        self::assertLessThanOrEqual($body['played'], $body['won']);
    }

    /** F31 R11, R12. Every win, and what a card needs to draw one. */
    public function testTheWinsCarryWhatTheCounterNeeds(): void
    {
        $this->signInAsAdmin();
        $this->givenAWheelThatAlwaysWins();

        $id = $this->givenAPlayer(spins: 2);

        $this->client->request('GET', self::LIST_URI.'/'.$id);

        $body = $this->decodeResponse();

        self::assertSame(2, $body['played']);
        self::assertSame(2, $body['won']);
        self::assertSame(
            [
                'id',
                'prizeName',
                'spunAt',
                'rewardType',
                'rewardValue',
                'code',
                'claimedAt',
                'claimedBy',
                'game',
                'sheetId',
            ],
            array_keys($body['wins'][0]),
        );
        self::assertNull($body['wins'][0]['claimedAt'], 'Nothing is collected yet.');
        self::assertNull($body['wins'][0]['claimedBy']);
    }

    /**
     * F31 R13. The spins that won nothing are counted and not listed, and
     * the count is what stops that being a page hiding something.
     */
    public function testItCountsThePlaysThatWonNothingWithoutListingThem(): void
    {
        $this->signInAsAdmin();
        $this->givenAWheelThatAlwaysWins();

        $id = $this->givenAPlayer(spins: 3);

        /*
         * The rows are turned into losing ones rather than drawn as losing
         * ones. A probability is between 1 and 100 (F01), so no wheel can be
         * made to lose every time, and a test built on 99 against 1 would
         * flap. What is being checked is what the page does with a losing
         * row, which this produces exactly.
         */
        $this->entityManager->getConnection()->executeStatement(
            "UPDATE spin SET reward_type = 'nothing', reward_value = NULL, reward_code = NULL",
        );

        $this->client->request('GET', self::LIST_URI.'/'.$id);

        $body = $this->decodeResponse();

        self::assertSame(3, $body['played']);
        self::assertSame(0, $body['won']);
        self::assertSame([], $body['wins']);
    }

    /** F08 R22, F31 R11 — most recent first */
    public function testTheHistoryIsNewestFirst(): void
    {
        $this->signInAsAdmin();
        $this->givenAWheelThatAlwaysWins();

        $id = $this->givenAPlayer(spins: 4);

        $this->client->request('GET', self::LIST_URI.'/'.$id);

        $ids = array_column($this->decodeResponse()['wins'], 'id');

        // Asserted on the ids rather than the timestamps: pressing "Spin
        // again" lands several spins in the same second, and a tie would
        // leave the order to the database. Descending ids are what "most
        // recent first" has to mean when the clock cannot tell them apart.
        $descending = $ids;
        rsort($descending);

        self::assertSame($descending, $ids);
        self::assertCount(4, $ids);
    }

    public function testAPlayerWhoHasNeverSpunHasAnEmptyHistory(): void
    {
        $id = $this->givenAPlayer(spins: 0);

        $this->signInAsAdmin();
        $this->client->request('GET', self::LIST_URI.'/'.$id);

        self::assertResponseIsSuccessful();
        self::assertSame([], $this->decodeResponse()['wins']);
        self::assertSame(0, $this->decodeResponse()['played']);
        self::assertSame(0, $this->decodeResponse()['won']);
        self::assertSame(0, $this->decodeResponse()['player']['spinCount']);
    }

    public function testAPlayerWhoDoesNotExistIsANotFound(): void
    {
        $this->signInAsAdmin();
        $this->client->request('GET', self::LIST_URI.'/4242');

        self::assertResponseStatusCodeSame(Response::HTTP_NOT_FOUND);
    }

    /**
     * F08 R22. The history reads the spin's own snapshot (F02 R10), so it
     * still says what was won after the admin tidied the wheel up.
     */
    public function testTheHistoryStillNamesAPrizeThatHasSinceBeenDeleted(): void
    {
        $this->signInAsAdmin();
        $this->givenAWheelThatAlwaysWins();

        $id = $this->givenAPlayer(spins: 1);

        $this->client->request('GET', self::LIST_URI.'/'.$id);
        $won = $this->decodeResponse()['wins'][0]['prizeName'];

        $this->put($this->wheelUri(), [
            'prizes' => [
                ['name' => 'Something else', 'probability' => 50, 'rewardId' => $this->aRewardId()],
                ['name' => 'Another thing', 'probability' => 50, 'rewardId' => $this->aRewardId()],
            ],
        ]);
        self::assertResponseIsSuccessful();

        $this->client->request('GET', self::LIST_URI.'/'.$id);

        self::assertSame($won, $this->decodeResponse()['wins'][0]['prizeName']);
    }

    // --------------------------------------- F31 R1-R7: a code finds them

    /** F31 R1, R5. The ticket in the customer's hand finds the customer. */
    public function testItFindsACustomerByACodeTheyWon(): void
    {
        $this->signInAsAdmin();
        $this->givenAWheelThatAlwaysWins();

        $this->givenAPlayer('0912345678', spins: 1);
        $this->givenAPlayer('0987654321', 'Binh');

        $code = $this->aStoredCode();

        $this->client->request('GET', self::LIST_URI.'?search='.$code);

        self::assertResponseIsSuccessful();
        self::assertSame(1, $this->decodeResponse()['total']);
        self::assertSame('0912345678', $this->decodeResponse()['players'][0]['phone']);
    }

    /** F31 R2, R3. Read aloud, typed carelessly, found anyway. */
    public function testItFindsThemByACodeTypedCarelessly(): void
    {
        $this->signInAsAdmin();
        $this->givenAWheelThatAlwaysWins();
        $this->givenAPlayer('0912345678', spins: 1);

        $code = $this->aStoredCode();
        $careless = strtolower(str_replace('-', ' ', $code));

        $this->client->request('GET', self::LIST_URI.'?search='.urlencode($careless));
        self::assertSame(1, $this->decodeResponse()['total'], 'Lower case with a space.');

        $this->client->request('GET', self::LIST_URI.'?search='.substr($code, 0, 4));
        self::assertSame(1, $this->decodeResponse()['total'], 'The first four characters.');
    }

    /**
     * F31 R1. The search counts a customer once, and their spins properly.
     *
     * The regression this guards is the tempting implementation: matching
     * the code on the join that counts spins, which would make everybody
     * found by a code look like they had played exactly once.
     */
    public function testACustomerFoundByACodeStillCountsEveryPlay(): void
    {
        $this->signInAsAdmin();
        $this->givenAWheelThatAlwaysWins();
        $this->givenAPlayer('0912345678', spins: 3);

        $this->client->request('GET', self::LIST_URI.'?search='.$this->aStoredCode());

        self::assertSame(1, $this->decodeResponse()['total']);
        self::assertSame(3, $this->decodeResponse()['players'][0]['spinCount']);
    }

    /** F31 R4. A number is not a code, and is searched as a number. */
    public function testInputThatCannotBeACodeIsSearchedAsANumber(): void
    {
        $this->givenAPlayer('0912345678');

        $this->signInAsAdmin();

        // `0` and `1` are not in the code alphabet (F13 R18), so this can
        // only be a phone fragment — and still finds the customer.
        $this->client->request('GET', self::LIST_URI.'?search=0912');

        self::assertSame(1, $this->decodeResponse()['total']);
    }

    /** F31 R7. A prize the shop owes somebody nobody can name. */
    public function testACodeWhoseWinHasNoCustomerSaysSo(): void
    {
        $this->signInAsAdmin();
        $this->givenAWheelThatAlwaysWins();
        $this->givenAPlayer('0912345678', spins: 1);

        $code = $this->aStoredCode();

        // The spin outlives its customer (F08 R19): the prize left the shop
        // and the log still has to say so (F09 R15).
        $this->entityManager->getConnection()->executeStatement('UPDATE spin SET player_id = NULL');

        $this->client->request('GET', self::LIST_URI.'?search='.$code);

        self::assertResponseIsSuccessful();
        self::assertSame(0, $this->decodeResponse()['total']);
        self::assertTrue(
            $this->decodeResponse()['winWithoutCustomer'],
            'The counter must be told where that prize can still be handed over.',
        );
    }

    /** The ordinary nothing stays an ordinary nothing. */
    public function testAFilterMatchingNothingSaysNothingAboutOrphanWins(): void
    {
        $this->givenAPlayer('0912345678');

        $this->signInAsAdmin();
        $this->client->request('GET', self::LIST_URI.'?search=KKKK');

        self::assertSame(0, $this->decodeResponse()['total']);
        self::assertFalse($this->decodeResponse()['winWithoutCustomer']);
    }


    /** The code of the one win in the log, as it is stored. */
    private function aStoredCode(): string
    {
        $code = $this->entityManager->getConnection()->fetchOne(
            'SELECT reward_code FROM spin WHERE reward_code IS NOT NULL ORDER BY id DESC LIMIT 1',
        );

        self::assertIsString($code, 'The test expected a win with a code.');

        return $code;
    }

    /**
     * Registers a player on the client's session and spins for them, then
     * clears the session so the next call starts from nobody.
     *
     * Done through the API rather than by inserting rows, so the player and
     * their spins are wired together exactly as the application wires them.
     */
    private function givenAPlayer(
        string $phone = '0912345678',
        string $firstName = 'Anh',
        string $lastName = 'Le',
        int $spins = 0,
    ): int {
        $this->post('/api/player/register', [
            'phone' => $phone,
            'firstName' => $firstName,
            'lastName' => $lastName,
            'birthday' => '1994-03-12',
        ]);
        self::assertResponseIsSuccessful();

        for ($i = 0; $i < $spins; ++$i) {
            $this->spinOnceMore($phone);
        }

        $this->post('/api/player/forget');

        $player = $this->entityManager->getRepository(Player::class)
            ->findOneBy(['phone' => $phone]);
        self::assertNotNull($player);

        $id = $player->getId();
        self::assertIsInt($id);

        return $id;
    }
}
