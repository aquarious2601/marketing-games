<?php

declare(strict_types=1);

namespace App\Tests\Controller\Admin;

use App\Entity\Player;
use App\Tests\Support\DatabaseWebTestCase;
use Symfony\Component\HttpFoundation\Response;

/**
 * F32: what the game costs and what it brings.
 *
 * The spins are written here rather than played for, as SpinLookupTest
 * writes its codes: every figure in this module is about *when* something
 * happened, and a real spin happens now. A test that could only produce
 * "today" could not check a day boundary, a collection two days after a
 * win, or a median delay.
 */
final class StatsControllerTest extends DatabaseWebTestCase
{
    private const URI = '/api/admin/stats';

    /** The shop these tests trade in, which is where their days come from. */
    private const ZONE = 'Asia/Ho_Chi_Minh';

    // ----------------------------------------------------------- the guard

    /** F32 R30, with F07 R17 */
    public function testTheStatsAreClosedToStrangers(): void
    {
        $this->client->request('GET', self::URI);

        self::assertResponseStatusCodeSame(Response::HTTP_UNAUTHORIZED);
    }

    // --------------------------------------------- R12-R14: what it brings

    /** F32 R12, R14. One customer who played four times is one customer. */
    public function testItCountsCustomersAndPlaysApart(): void
    {
        $this->signInAsAdmin();
        $this->givenTheShopIsIn(self::ZONE);

        $anh = $this->givenACustomer('0912345678');

        $this->givenAWin($anh, 'Free coffee', at: 'today 10:00');
        $this->givenAWin($anh, 'Free coffee', at: 'today 11:00');
        $this->givenALoss($anh, at: 'today 12:00');

        $totals = $this->read()['totals'];

        self::assertSame(1, $totals['customers']);
        self::assertSame(3, $totals['plays']);
        self::assertSame(2, $totals['wins']);
        // R14: stated rather than left to subtraction.
        self::assertSame(1, $totals['wonNothing']);
    }

    /** F32 R13. New is a first play, and the two halves add up. */
    public function testItTellsANewCustomerFromAReturningOne(): void
    {
        $this->signInAsAdmin();
        $this->givenTheShopIsIn(self::ZONE);

        $anh = $this->givenACustomer('0912345678');
        $binh = $this->givenACustomer('0987654321');

        // Anh played before this week, so today they are returning.
        $this->givenAWin($anh, 'Free coffee', at: '-10 days 10:00');
        $this->givenAWin($anh, 'Free coffee', at: 'today 10:00');
        $this->givenAWin($binh, 'Free coffee', at: 'today 11:00');

        $today = $this->read()['days'][0];

        self::assertSame(2, $today['customers']);
        self::assertSame(1, $today['newCustomers'], 'Binh played for the first time today.');
        self::assertSame(1, $today['returningCustomers'], 'Anh had played before.');
    }

    /** F32 R12, R19. A customer who played twice in a week is one customer. */
    public function testTheTotalDoesNotAddTheDaysUp(): void
    {
        $this->signInAsAdmin();
        $this->givenTheShopIsIn(self::ZONE);

        $anh = $this->givenACustomer('0912345678');

        $this->givenAWin($anh, 'Free coffee', at: 'today 10:00');
        $this->givenAWin($anh, 'Free coffee', at: '-2 days 10:00');

        $body = $this->read();

        self::assertSame(1, $body['totals']['customers'], 'One person, two days.');
        self::assertSame(2, $body['totals']['plays']);
    }

    // ------------------------------------------- R1-R10: what it costs

    /** F32 R1, R8. A free product's cost is whatever the shop typed. */
    public function testItTotalsWhatTheWinsCost(): void
    {
        $this->signInAsAdmin();
        $this->givenTheShopIsIn(self::ZONE);

        $anh = $this->givenACustomer('0912345678');

        $this->givenAWin($anh, 'Free coffee', at: 'today 10:00', cost: 25_000);
        $this->givenAWin($anh, 'Free cake', at: 'today 11:00', cost: 40_000);

        $totals = $this->read()['totals'];

        self::assertSame(65_000, $totals['issuedCost']);
        self::assertSame(0, $totals['unpricedIssued']);
    }

    /** F32 R7, R20. Unpriced is counted, not totalled as free. */
    public function testItSaysHowManyWinsItCouldNotPrice(): void
    {
        $this->signInAsAdmin();
        $this->givenTheShopIsIn(self::ZONE);

        $anh = $this->givenACustomer('0912345678');

        $this->givenAWin($anh, 'Free coffee', at: 'today 10:00', cost: 25_000);
        $this->givenAWin($anh, 'Mystery gift', at: 'today 11:00', cost: null);

        $totals = $this->read()['totals'];

        self::assertSame(25_000, $totals['issuedCost'], 'The unpriced one is not a zero.');
        self::assertSame(1, $totals['unpricedIssued']);
    }

    /**
     * F32 R15. Issued belongs to the day it was won; collected belongs to
     * the day it was handed over, because that is the day the shop spent it.
     */
    public function testACollectionCountsOnTheDayItWasHandedOver(): void
    {
        $this->signInAsAdmin();
        $this->givenTheShopIsIn(self::ZONE);

        $anh = $this->givenACustomer('0912345678');

        $this->givenAWin(
            $anh,
            'Free coffee',
            at: '-2 days 10:00',
            cost: 25_000,
            collectedAt: 'today 09:00',
        );

        $body = $this->read();
        $days = array_column($body['days'], null, 'day');

        $wonOn = $this->dayOf('-2 days 10:00');
        $collectedOn = $this->dayOf('today 09:00');

        self::assertSame(25_000, $days[$wonOn]['issuedCost'], 'The liability is the day it was won.');
        self::assertSame(0, $days[$wonOn]['collectedCost']);

        self::assertSame(25_000, $days[$collectedOn]['collectedCost'], 'The spend is the day it went out.');
        self::assertSame(0, $days[$collectedOn]['issuedCost']);

        // And the two are never added together.
        self::assertSame(25_000, $body['totals']['issuedCost']);
        self::assertSame(25_000, $body['totals']['collectedCost']);
    }

    // ------------------------------------------------ R16, R17: coming back

    /** F32 R16. Of the wins issued, the share collected as of now. */
    public function testItReportsTheCollectionRate(): void
    {
        $this->signInAsAdmin();
        $this->givenTheShopIsIn(self::ZONE);

        $anh = $this->givenACustomer('0912345678');

        $this->givenAWin($anh, 'Free coffee', at: 'today 10:00', collectedAt: 'today 12:00');
        $this->givenAWin($anh, 'Free cake', at: 'today 10:30');
        $this->givenAWin($anh, 'Ten off', at: 'today 11:00');

        $totals = $this->read()['totals'];

        self::assertSame(0.3333, $totals['collectionRate']);
        self::assertSame(2, $totals['outstanding']);
    }

    /** F32 R21. Nothing to divide by is nothing, not a zero per cent. */
    public function testARateWithNothingBehindItIsNothing(): void
    {
        $this->signInAsAdmin();
        $this->givenTheShopIsIn(self::ZONE);

        $totals = $this->read()['totals'];

        self::assertNull($totals['collectionRate']);
        self::assertSame(0, $totals['customers']);
        self::assertSame(0, $totals['plays']);
    }

    /** F32 R17. The median, so one late voucher cannot rewrite an afternoon. */
    public function testItReportsTheMedianDelayBeforeACollection(): void
    {
        $this->signInAsAdmin();
        $this->givenTheShopIsIn(self::ZONE);

        $anh = $this->givenACustomer('0912345678');

        // One hour, two hours, and a hundred hours.
        $this->givenAWin($anh, 'Free coffee', at: 'today 08:00', collectedAt: 'today 09:00');
        $this->givenAWin($anh, 'Free cake', at: 'today 08:00', collectedAt: 'today 10:00');
        $this->givenAWin($anh, 'Ten off', at: 'today 08:00', collectedAt: '+4 days 12:00');

        self::assertSame(7_200, $this->read()['totals']['medianDelaySeconds']);
    }

    public function testTheDelayIsNothingWhenNobodyHasCollected(): void
    {
        $this->signInAsAdmin();
        $this->givenTheShopIsIn(self::ZONE);

        $anh = $this->givenACustomer('0912345678');
        $this->givenAWin($anh, 'Free coffee', at: 'today 10:00');

        self::assertNull($this->read()['totals']['medianDelaySeconds']);
    }

    // ------------------------------------------------- R18, R19, R23, R25

    /**
     * F32 R18. The store's day, not the reader's.
     *
     * 23:30 in Ho Chi Minh City is 16:30 UTC the same day, and 00:30 in Ho
     * Chi Minh City is 17:30 UTC the day before — so a spin at half past
     * midnight local belongs to the local day, which is the day it was
     * counted in (F23 R6).
     */
    public function testADayIsTheShopsDay(): void
    {
        $this->signInAsAdmin();
        $this->givenTheShopIsIn(self::ZONE);

        $anh = $this->givenACustomer('0912345678');

        $this->givenAWin($anh, 'Free coffee', at: 'today 00:30');
        $this->givenAWin($anh, 'Free cake', at: 'today 23:30');

        $today = array_column($this->read()['days'], null, 'day')[$this->dayOf('today 12:00')];

        self::assertSame(2, $today['plays'], 'Both spins are in the shop’s day.');
    }

    /** F32 R19. Each game's figures, and the total across them. */
    public function testEveryFigureCanBeReadForOneGame(): void
    {
        $this->signInAsAdmin();
        $this->givenTheShopIsIn(self::ZONE);

        $anh = $this->givenACustomer('0912345678');
        $second = $this->givenASecondGame();

        $this->givenAWin($anh, 'Free coffee', at: 'today 10:00', cost: 25_000);
        $this->givenAWin($anh, 'Free cake', at: 'today 11:00', cost: 40_000, game: $second);

        $everything = $this->read()['totals'];
        $onlyTheSecond = $this->read(['game' => (string) $second])['totals'];

        self::assertSame(65_000, $everything['issuedCost']);
        self::assertSame(40_000, $onlyTheSecond['issuedCost']);
        self::assertSame(1, $onlyTheSecond['wins']);
        // R19: one customer in each game's figures, and one in the total.
        self::assertSame(1, $everything['customers']);
        self::assertSame(1, $onlyTheSecond['customers']);
    }

    /** F32 R23, R24, R25. Seven days, newest first, zeros and all. */
    public function testItOpensOnSevenDaysWithARowForEachOfThem(): void
    {
        $this->signInAsAdmin();
        $this->givenTheShopIsIn(self::ZONE);

        $body = $this->read();

        self::assertCount(7, $body['days']);
        self::assertSame($this->dayOf('today 12:00'), $body['days'][0]['day'], 'Newest first.');
        self::assertSame($this->dayOf('-6 days 12:00'), $body['days'][6]['day']);

        // R25: a day on which nothing happened is a row of zeros.
        foreach ($body['days'] as $day) {
            self::assertSame(0, $day['plays']);
            self::assertSame(0, $day['customers']);
            self::assertNull($day['collectionRate']);
        }
    }

    public function testItAnswersForTheDaysItWasAsked(): void
    {
        $this->signInAsAdmin();
        $this->givenTheShopIsIn(self::ZONE);

        $from = $this->dayOf('-2 days 12:00');
        $to = $this->dayOf('today 12:00');

        $body = $this->read(['from' => $from, 'to' => $to]);

        self::assertSame($from, $body['from']);
        self::assertSame($to, $body['to']);
        self::assertCount(3, $body['days']);
    }

    // ------------------------------------------------------- the refusals

    public function testItRefusesAFirstDayAfterTheLast(): void
    {
        $this->signInAsAdmin();

        $this->read(['from' => $this->dayOf('today 12:00'), 'to' => $this->dayOf('-3 days 12:00')], ok: false);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('from', $this->decodeResponse()['error']['violations'][0]['field']);
    }

    public function testItRefusesAStretchLongerThanAYear(): void
    {
        $this->signInAsAdmin();

        $this->read(['from' => '2020-01-01', 'to' => $this->dayOf('today 12:00')], ok: false);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('to', $this->decodeResponse()['error']['violations'][0]['field']);
    }

    public function testItRefusesSomethingThatIsNotADay(): void
    {
        $this->signInAsAdmin();

        $this->read(['from' => 'last Tuesday'], ok: false);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('from', $this->decodeResponse()['error']['violations'][0]['field']);
    }

    public function testAGameThatDoesNotExistIsANotFound(): void
    {
        $this->signInAsAdmin();

        $this->read(['game' => '4242'], ok: false);

        self::assertResponseStatusCodeSame(Response::HTTP_NOT_FOUND);
    }

    // ---------------------------------------------------------- fixtures

    /** @param array<string, string> $query */
    private function read(array $query = [], bool $ok = true): array
    {
        $this->client->request('GET', self::URI.($query === [] ? '' : '?'.http_build_query($query)));

        if ($ok) {
            self::assertResponseIsSuccessful();
        }

        return $this->decodeResponse();
    }

    private function givenTheShopIsIn(string $zone): void
    {
        $this->put('/api/admin/store', ['timezone' => $zone]);
        self::assertResponseIsSuccessful('The test could not set the shop’s clock.');
    }

    private function givenACustomer(string $phone): int
    {
        $this->post('/api/player/register', [
            'phone' => $phone,
            'firstName' => 'Anh',
            'lastName' => 'Le',
            'birthday' => '1994-03-12',
        ]);
        self::assertResponseIsSuccessful();
        $this->post('/api/player/forget');

        $player = $this->entityManager->getRepository(Player::class)->findOneBy(['phone' => $phone]);
        self::assertInstanceOf(Player::class, $player);

        $id = $player->getId();
        self::assertIsInt($id);

        return $id;
    }

    /**
     * One recorded win, written straight into the log.
     *
     * `$at` and `$collectedAt` are read in the shop's zone and stored as the
     * instants the column holds, which is the whole point: a test about days
     * has to be able to say "half past midnight, local".
     */
    private function givenAWin(
        int $player,
        string $prizeName,
        string $at,
        ?int $cost = null,
        ?string $collectedAt = null,
        ?int $game = null,
    ): void {
        $this->insertSpin($player, $prizeName, 'free_product', $at, $cost, $collectedAt, $game);
    }

    private function givenALoss(int $player, string $at, ?int $game = null): void
    {
        $this->insertSpin($player, 'Maybe next time', 'nothing', $at, null, null, $game);
    }

    private function insertSpin(
        int $player,
        string $prizeName,
        string $rewardType,
        string $at,
        ?int $cost,
        ?string $collectedAt,
        ?int $game,
    ): void {
        $this->entityManager->getConnection()->insert('spin', [
            'prize_name' => $prizeName,
            'spun_at' => $this->instant($at),
            'player_id' => $player,
            'reward_type' => $rewardType,
            'reward_cost' => $cost,
            'claimed_at' => null === $collectedAt ? null : $this->instant($collectedAt),
            'game_id' => $game ?? $this->theStoresGame(),
        ]);
    }

    /** The one wheel game every test case starts with (F27 R32). */
    private function theStoresGame(): int
    {
        $id = $this->game->getId();
        self::assertIsInt($id);

        return $id;
    }

    /** A second game of the store's, so R19 has two to tell apart. */
    private function givenASecondGame(): int
    {
        $this->post('/api/admin/games', ['name' => 'Gift sheet', 'type' => 'gift-sheet']);
        self::assertResponseIsSuccessful();

        $id = $this->decodeResponse()['id'];
        self::assertIsInt($id);

        return $id;
    }

    /** The UTC instant of a local moment in the shop's zone. */
    private function instant(string $when): string
    {
        return (new \DateTimeImmutable($when, new \DateTimeZone(self::ZONE)))
            ->setTimezone(new \DateTimeZone('UTC'))
            ->format('Y-m-d H:i:s');
    }

    /** The shop's day a local moment falls in. */
    private function dayOf(string $when): string
    {
        return (new \DateTimeImmutable($when, new \DateTimeZone(self::ZONE)))->format('Y-m-d');
    }
}
