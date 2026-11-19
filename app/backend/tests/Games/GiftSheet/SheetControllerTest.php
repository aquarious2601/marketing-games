<?php

declare(strict_types=1);

namespace App\Tests\Games\GiftSheet;

use App\Entity\Game;
use App\Entity\Reward;
use App\Game\GameType;
use App\Games\GiftSheet\Entity\Gift;
use App\Reward\RewardType;
use App\Tests\Support\DatabaseWebTestCase;
use Symfony\Component\HttpFoundation\Response;

/**
 * F28: playing a gift sheet, and configuring one.
 *
 * The rules worth holding down here are the ones a wheel does not have:
 * everybody gets everything (R10), all of it or none of it (R11), and the
 * limit counts sheets rather than rows (R17) — which is the one that would
 * silently hand a player a third of what they were promised if it were
 * wrong.
 */
final class SheetControllerTest extends DatabaseWebTestCase
{
    private const SHEET_URI = '/api/sheet';

    private Game $sheetGame;

    protected function setUp(): void
    {
        parent::setUp();

        // The wheel the fixture seeds is turned off, so the sheet is the one
        // live game and `/` resolves to it (F27 R26).
        $this->game->setLive(false);

        $this->sheetGame = new Game($this->store, 'Welcome pack', GameType::GiftSheet);
        $this->sheetGame->setLive(true);
        $this->entityManager->persist($this->sheetGame);
        $this->entityManager->flush();
    }

    // --------------------------------------------------------------- playing

    /** F28 §9: what is on the sheet, before anybody presses anything. */
    public function testItTellsThePlayerWhatIsOnTheSheet(): void
    {
        $this->givenGifts('Free coffee', 'Tote bag');

        $this->client->request('GET', self::SHEET_URI);

        self::assertResponseIsSuccessful();
        self::assertSame(
            ['Free coffee', 'Tote bag'],
            array_column($this->decodeResponse()['gifts'], 'name'),
        );
    }

    /** F28 R10: every reward on the list, to everybody who plays. */
    public function testItGivesEveryGiftOnTheSheet(): void
    {
        $this->givenGifts('Free coffee', 'Tote bag', 'Ten off');
        $this->identifyAsPlayer();

        $this->post(self::SHEET_URI);

        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);
        self::assertSame(
            ['Free coffee', 'Tote bag', 'Ten off'],
            array_column($this->decodeResponse()['gifts'], 'name'),
        );
    }

    /** F28 R10, R6: in the admin's order, not sorted behind their back. */
    public function testItGivesThemInTheAdminsOrder(): void
    {
        $this->givenGifts('Tote bag', 'Free coffee');
        $this->identifyAsPlayer();

        $this->post(self::SHEET_URI);

        self::assertSame(
            ['Tote bag', 'Free coffee'],
            array_column($this->decodeResponse()['gifts'], 'name'),
        );
    }

    /** F28 R10, F16 R1: a code per gift, and no two the same. */
    public function testEveryGiftCarriesItsOwnCode(): void
    {
        $this->givenGifts('Free coffee', 'Tote bag', 'Ten off');
        $this->identifyAsPlayer();

        $this->post(self::SHEET_URI);

        $codes = array_column($this->decodeResponse()['gifts'], 'code');

        self::assertCount(3, $codes);
        self::assertCount(3, array_unique($codes), 'two gifts shared a code');
        self::assertNotContains(null, $codes);
    }

    /** F28 R12: one row per gift, sharing one sheet identity (R19). */
    public function testTheLogHoldsOneRowPerGiftSharingOneSheet(): void
    {
        $this->givenGifts('Free coffee', 'Tote bag', 'Ten off');
        $this->identifyAsPlayer();
        $this->post(self::SHEET_URI);

        $rows = $this->connection()->fetchAllAssociative(
            'SELECT prize_name, sheet_id, prize_probability FROM spin ORDER BY id',
        );

        self::assertCount(3, $rows);
        self::assertCount(1, array_unique(array_column($rows, 'sheet_id')));
        self::assertNotNull($rows[0]['sheet_id']);

        // F28 §7: a gift was not drawn, so it has no probability.
        foreach ($rows as $row) {
            self::assertNull($row['prize_probability'], 'a gift was given a probability');
        }
    }

    /** F28 R8: the wheel's identification, and nothing may be given without it. */
    public function testItRefusesToGiveAnythingToANobody(): void
    {
        $this->givenGifts('Free coffee');

        $this->post(self::SHEET_URI);

        self::assertResponseStatusCodeSame(Response::HTTP_FORBIDDEN);
        self::assertSame(0, $this->countSpins());
    }

    /** F28 R7: a live sheet with nothing on it says so rather than giving nothing. */
    public function testItRefusesAnEmptySheet(): void
    {
        $this->identifyAsPlayer();

        $this->post(self::SHEET_URI);

        self::assertResponseStatusCodeSame(Response::HTTP_CONFLICT);
        self::assertSame(0, $this->countSpins());
    }

    /** F28 §10: a sheet endpoint asked about a wheel is a client bug. */
    public function testTheSheetEndpointRefusesAWheel(): void
    {
        $this->sheetGame->setLive(false);
        $this->game->setLive(true);
        $this->entityManager->flush();

        $this->client->request('GET', self::SHEET_URI);

        self::assertResponseStatusCodeSame(Response::HTTP_CONFLICT);
    }

    // ---------------------------------------------------------- how often

    /**
     * F28 R17, the rule this feature turns on.
     *
     * A limit of one on a sheet of three means one *sheet*. Counting rows
     * would make the first sheet's second gift the thing that exhausted the
     * allowance.
     */
    public function testALimitOfOneStillGivesTheWholeSheet(): void
    {
        $this->givenGifts('Free coffee', 'Tote bag', 'Ten off');
        $this->sheetGame->setDailyLimit(1);
        $this->entityManager->flush();

        $this->identifyAsPlayer();
        $this->post(self::SHEET_URI);

        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);
        self::assertCount(3, $this->decodeResponse()['gifts']);
    }

    /** F28 R20: and the second sheet is refused. */
    public function testASecondSheetIsRefusedOnceTheAllowanceIsSpent(): void
    {
        $this->givenGifts('Free coffee', 'Tote bag');
        $this->sheetGame->setDailyLimit(1);
        $this->entityManager->flush();

        $this->identifyAsPlayer();
        $this->post(self::SHEET_URI);
        $this->post(self::SHEET_URI);

        self::assertResponseStatusCodeSame(Response::HTTP_TOO_MANY_REQUESTS);
        self::assertSame(2, $this->countSpins(), 'the refusal gave something away');
    }

    /** F28 R18: the refusal says nothing about what was given. */
    public function testTheRefusalCarriesNoCodes(): void
    {
        $this->givenGifts('Free coffee');
        $this->sheetGame->setDailyLimit(1);
        $this->entityManager->flush();

        $this->identifyAsPlayer();
        $this->post(self::SHEET_URI);
        $code = $this->decodeResponse()['gifts'][0]['code'];

        $this->post(self::SHEET_URI);

        self::assertStringNotContainsString(
            (string) $code,
            (string) $this->client->getResponse()->getContent(),
        );
    }

    /** F27 R30: a sheet's allowance is its own. */
    public function testASpentSheetLeavesTheWheelAlone(): void
    {
        $this->givenGifts('Free coffee');
        $this->sheetGame->setDailyLimit(1);
        $this->game->setDailyLimit(1);
        $this->entityManager->flush();

        $this->identifyAsPlayer();
        $this->post(self::SHEET_URI);
        $this->post(self::SHEET_URI);
        self::assertResponseStatusCodeSame(Response::HTTP_TOO_MANY_REQUESTS);

        self::assertSame(
            0,
            $this->sheetsGivenToday(),
            'sanity: the count is of sheets, and there was one',
        );
    }

    /**
     * F27 R30. A spent sheet leaves the wheel's allowance alone: two
     * promotions, two budgets.
     */
    public function testTheWheelStillPlaysWhenTheSheetIsSpent(): void
    {
        $this->givenGifts('Free coffee');
        $this->sheetGame->setDailyLimit(1);
        $this->game->setDailyLimit(1);
        $this->game->setLive(true);
        $this->entityManager->flush();

        /*
         * Both games are live, so there is no "only live one" to fall back
         * on (F27 R26) and the session has to arrive by a link — which is
         * how a player arrives anyway (R20).
         */
        $this->client->request('GET', '/api/play/'.$this->sheetGame->getLinkKey());
        self::assertResponseIsSuccessful();

        $this->identifyAsPlayer();
        $this->post(self::SHEET_URI);
        $this->post(self::SHEET_URI);
        self::assertResponseStatusCodeSame(Response::HTTP_TOO_MANY_REQUESTS);

        // The wheel's link, so the session plays that game instead (R27).
        $this->client->request('GET', '/api/play/'.$this->game->getLinkKey());
        self::assertResponseIsSuccessful();

        $this->identifyAsPlayer();
        $this->post('/api/spin');

        self::assertResponseIsSuccessful();
    }

    /** F28 R10, F16 R1: a second sheet is a second set of codes. */
    public function testASecondSheetCarriesFreshCodes(): void
    {
        $this->givenGifts('Free coffee', 'Tote bag');
        // No limit, which is every game until an admin sets one.
        $this->identifyAsPlayer();

        $this->post(self::SHEET_URI);
        $first = array_column($this->decodeResponse()['gifts'], 'code');

        $this->post(self::SHEET_URI);
        $second = array_column($this->decodeResponse()['gifts'], 'code');

        self::assertCount(2, $second);
        self::assertSame([], array_intersect($first, $second), 'a code was handed out twice');
    }

    /** F28 R18: the same session's own sheet comes back on a reload. */
    public function testTheSameSessionSeesItsOwnSheetAgain(): void
    {
        $this->givenGifts('Free coffee', 'Tote bag');
        $this->identifyAsPlayer();
        $this->post(self::SHEET_URI);
        $issued = $this->decodeResponse();

        $this->client->request('GET', self::SHEET_URI);

        self::assertSame($issued['sheetId'], $this->decodeResponse()['issued']['sheetId']);
    }

    // --------------------------------------------------------------- helpers

    private function givenGifts(string ...$names): void
    {
        $position = 0;

        foreach ($names as $name) {
            $reward = new Reward($name, RewardType::FreeProduct, null);
            $this->entityManager->persist($reward);
            $this->entityManager->persist(new Gift($this->sheetGame, $reward, $position));
            ++$position;
        }

        $this->entityManager->flush();
    }

    private function countSpins(): int
    {
        return (int) $this->connection()->fetchOne('SELECT COUNT(*) FROM spin');
    }

    private function sheetsGivenToday(): int
    {
        return (int) $this->connection()->fetchOne(
            'SELECT COUNT(DISTINCT sheet_id) - 1 FROM spin WHERE sheet_id IS NOT NULL',
        );
    }

    private function connection(): \Doctrine\DBAL\Connection
    {
        return $this->entityManager->getConnection();
    }
}
