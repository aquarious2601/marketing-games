<?php

declare(strict_types=1);

namespace App\Tests\Player;

use App\Entity\Game;
use App\Game\GameType;
use App\Tests\Support\DatabaseWebTestCase;
use Symfony\Component\BrowserKit\Cookie;
use Symfony\Component\HttpFoundation\Response;

/**
 * F36: one browser, two games, two identifications.
 *
 * Everything here goes through the endpoints rather than through
 * PlayerSession directly, because what broke was not a method — it was what
 * a sequence of requests did to a session, and a unit test of the class
 * would have agreed with itself while the stall phone threw customers out.
 *
 * The sequence in {@see testTheWheelStillKnowsThemAfterTheSheetIsOpened} is
 * the bug as it was reported: register at the wheel, something opens the
 * other game, press Spin, and the page sends the customer back to the form
 * with the card they were shown gone for good (F34 R8).
 */
final class EachGameKeepsItsOwnCustomerTest extends DatabaseWebTestCase
{
    private const WHEEL = '/api/play/';

    private Game $sheetGame;

    protected function setUp(): void
    {
        parent::setUp();

        $this->giveTheGameItsWheel();

        // Two live games, which is the shop this was reported from.
        $this->sheetGame = new Game($this->store, 'Welcome pack', GameType::GiftSheet);
        $this->sheetGame->setLive(true);
        $this->entityManager->persist($this->sheetGame);
        $this->entityManager->flush();
    }

    // ------------------------------------------------------- the bug itself

    /** F36 R1, R2. The reported sequence, in order. */
    public function testTheWheelStillKnowsThemAfterTheSheetIsOpened(): void
    {
        $this->openTheWheel();
        $this->identifyAsPlayer();

        $this->openTheSheet();
        $this->openTheWheel();

        self::assertSame('0912345678', $this->whoAmI());
    }

    /** F36 R1. And can still do the thing they were in the middle of. */
    public function testTheySpinAfterTheDetour(): void
    {
        $this->openTheWheel();
        $this->identifyAsPlayer();

        $this->openTheSheet();
        $this->openTheWheel();

        $this->client->request('POST', '/api/spin');

        self::assertResponseIsSuccessful();
    }

    /**
     * F36 R5, and F27 R28's other half: identifying at the wheel is not
     * identifying at the sheet. This is the part that must not regress while
     * fixing the part above.
     */
    public function testTheSheetDoesNotKnowTheWheelsCustomer(): void
    {
        $this->openTheWheel();
        $this->identifyAsPlayer();

        $this->openTheSheet();

        self::assertNull($this->whoAmI());
    }

    /** F36 R1. Two games, two customers, one browser. */
    public function testEachGameReportsItsOwn(): void
    {
        $this->openTheWheel();
        $this->identifyAsPlayer('0912345678');

        $this->openTheSheet();
        $this->identifyAsPlayer('0987654321');

        self::assertSame('0987654321', $this->whoAmI());

        $this->openTheWheel();

        self::assertSame('0912345678', $this->whoAmI());
    }

    // ------------------------------------------------------------ the spin

    /** F36 R3. A spin spent at the wheel is not spent at the sheet. */
    public function testASpinIsSpentInTheGameItWasSpentIn(): void
    {
        $this->openTheWheel();
        $this->identifyAsPlayer();
        $this->client->request('POST', '/api/spin');
        self::assertResponseIsSuccessful();

        // The same person, at the other game, has not played it.
        $this->openTheSheet();
        $this->identifyAsPlayer();

        self::assertNull($this->decodeResponse()['spin'] ?? null);

        $this->client->request('GET', '/api/player/me');

        self::assertNull($this->decodeResponse()['spin']);
    }

    /** F36 R6. Identifying again releases this game's spin and no other's. */
    public function testIdentifyingAgainReleasesOnlyThisGamesSpin(): void
    {
        $this->openTheWheel();
        $this->identifyAsPlayer();
        $this->client->request('POST', '/api/spin');

        $this->openTheSheet();
        $this->identifyAsPlayer();

        // Back at the wheel, the spin it recorded is still recorded: the
        // identification that released one did so at the sheet.
        $this->openTheWheel();
        $this->client->request('GET', '/api/player/me');

        self::assertNotNull($this->decodeResponse()['spin']);
    }

    // --------------------------------------------------------- handing over

    /** F36 R4. Next player, at this game. */
    public function testHandingOverAtTheWheelLeavesTheSheetAlone(): void
    {
        $this->openTheWheel();
        $this->identifyAsPlayer('0912345678');
        $this->openTheSheet();
        $this->identifyAsPlayer('0987654321');

        $this->openTheWheel();
        $this->client->request('POST', '/api/player/forget');

        self::assertNull($this->whoAmI());

        $this->openTheSheet();

        self::assertSame('0987654321', $this->whoAmI());
    }

    // --------------------------------------------------------- the bindings

    /**
     * F36 R7. A shop with one live game whose players arrive at `/` binds it
     * too, so their identification belongs to a game like everybody else's.
     */
    public function testArrivingWithNoLinkBindsTheOnlyLiveGame(): void
    {
        $this->turnOff($this->sheetGame);

        $this->client->request('GET', '/api/game');

        self::assertResponseIsSuccessful();

        $this->identifyAsPlayer();

        // Nothing has been opened by link, so only the binding `/api/game`
        // made can be holding this identification.
        self::assertSame('0912345678', $this->whoAmI());
    }

    /** F36 R10. A game turned off is no game, so it identifies nobody. */
    public function testAGameTurnedOffKnowsNobody(): void
    {
        $this->openTheWheel();
        $this->identifyAsPlayer();

        $this->turnOff($this->game);

        $this->client->request('GET', '/api/player/me');

        self::assertNull($this->decodeResponse()['player']);
    }

    // ------------------------------------------------- sessions from before

    /**
     * F36 R9. A customer mid-game when the release lands keeps their place.
     *
     * The session is written in the shape F36 replaced — one player id, one
     * bound game — and read back through the endpoints, which is the only
     * way that shape ever arrives.
     */
    public function testASessionFromBeforeThisFeatureStillKnowsThem(): void
    {
        $this->openTheWheel();
        $this->identifyAsPlayer();

        $playerId = (int) $this->connection()->fetchOne('SELECT id FROM player LIMIT 1');

        $this->givenALegacySession($playerId, (int) $this->game->getId());

        self::assertSame('0912345678', $this->whoAmI());
    }

    /** F36 R9. And it belongs to the game it was bound to, not to the next one. */
    public function testALegacySessionDoesNotFollowTheBrowserToAnotherGame(): void
    {
        $this->openTheWheel();
        $this->identifyAsPlayer();

        $playerId = (int) $this->connection()->fetchOne('SELECT id FROM player LIMIT 1');

        $this->givenALegacySession($playerId, (int) $this->game->getId());

        $this->openTheSheet();

        self::assertNull($this->whoAmI());
    }

    // --------------------------------------------------------------- helpers

    /**
     * Re-found first, because a request reboots the kernel and leaves the
     * entity this test is holding detached from the manager the next request
     * will use — a flush on it writes nothing, silently.
     */
    private function turnOff(Game $game): void
    {
        $found = $this->entityManager->getRepository(Game::class)->find($game->getId());
        \assert($found instanceof Game);

        $found->setLive(false);
        $this->entityManager->flush();
    }

    private function openTheWheel(): void
    {
        $this->client->request('GET', self::WHEEL.$this->game->getLinkKey());
        self::assertResponseIsSuccessful('The wheel could not be opened.');
    }

    private function openTheSheet(): void
    {
        $this->client->request('GET', self::WHEEL.$this->sheetGame->getLinkKey());
        self::assertResponseIsSuccessful('The sheet could not be opened.');
    }

    /** The phone number of whoever this session is, for the game it is on. */
    private function whoAmI(): ?string
    {
        $this->client->request('GET', '/api/player/me');

        self::assertResponseIsSuccessful();

        return $this->decodeResponse()['player']['phone'] ?? null;
    }

    /** The single identification and single binding that F36 replaced. */
    private function givenALegacySession(int $playerId, int $gameId): void
    {
        $session = static::getContainer()->get('session.factory')->createSession();

        $session->set('app_player_id', $playerId);
        $session->set('app_player_game', $gameId);
        $session->save();

        $this->client->getCookieJar()->set(new Cookie($session->getName(), $session->getId()));
    }

    private function connection(): \Doctrine\DBAL\Connection
    {
        return $this->entityManager->getConnection();
    }
}
