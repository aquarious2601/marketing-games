<?php

declare(strict_types=1);

namespace App\Tests\Controller\Admin;

use App\Entity\Game;
use App\Game\GameType;
use App\Game\LinkKey;
use App\Tests\Support\DatabaseWebTestCase;
use Symfony\Component\HttpFoundation\Response;

/**
 * F27 R38–R43: the store's games.
 *
 * The fields tested here used to be the campaign's and are tested here now
 * for that reason: the tagline and the daily allowance left
 * StoreControllerTest when they left the `store` row (R11).
 */
final class GameControllerTest extends DatabaseWebTestCase
{
    private const URI = '/api/admin/games';

    protected function setUp(): void
    {
        parent::setUp();

        $this->signInAsAdmin();

        // F27 R43: the seeded game is live, so it has to be ready — which
        // for a wheel means a wheel with prizes that total 100.
        $this->giveTheGameItsWheel();
    }

    // ------------------------------------------------------------- the list

    /** F27 R38 */
    public function testItListsTheStoresGames(): void
    {
        $this->client->request('GET', self::URI);

        self::assertResponseIsSuccessful();

        $body = $this->decodeResponse();

        self::assertCount(1, $body['games']);
        self::assertSame('Test campaign', $body['games'][0]['name']);
        self::assertSame('wheel', $body['games'][0]['type']);
        self::assertTrue($body['games'][0]['isLive']);
        self::assertSame(0, $body['games'][0]['plays']);
    }

    /** F27 R39: the kinds a new game may be, named in the admin's language. */
    public function testItOffersTheKindsOfGameThereAre(): void
    {
        $this->client->request('GET', self::URI);

        self::assertSame(
            ['wheel', 'gift-sheet'],
            array_column($this->decodeResponse()['types'], 'value'),
            'The wheel first, because it is the one every shop starts with.',
        );
    }

    /**
     * F27 R41: the path, which the page turns into the whole URL.
     *
     * Not the whole URL from here: the API answers on its own host, and in
     * development that is not the host the app is served from.
     */
    public function testEachGameCarriesItsLink(): void
    {
        $this->client->request('GET', self::URI);

        $game = $this->decodeResponse()['games'][0];

        self::assertSame('/play/'.$game['linkKey'], $game['playPath']);
    }

    // --------------------------------------------------------- creating one

    /** F27 R39 */
    public function testItCreatesAGameFromANameAndAKind(): void
    {
        $this->post(self::URI, ['name' => 'Black Friday', 'type' => 'wheel']);

        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);

        $body = $this->decodeResponse();

        self::assertSame('Black Friday', $body['name']);
        self::assertSame('wheel', $body['type']);
    }

    /**
     * F27 R39. Off, so a promotion nobody has configured is never reachable
     * by a link — and the key is minted now anyway (R21), because a poster
     * may be printed before the prizes are decided.
     */
    public function testANewGameIsNotLiveAndAlreadyHasItsLink(): void
    {
        $this->post(self::URI, ['name' => 'Black Friday', 'type' => 'wheel']);

        $body = $this->decodeResponse();

        self::assertFalse($body['isLive']);
        self::assertTrue(LinkKey::looksLikeOne($body['linkKey']));
    }

    /** F27 R19: unguessable, and no two the same. */
    public function testEveryGameGetsItsOwnKey(): void
    {
        $this->post(self::URI, ['name' => 'One', 'type' => 'wheel']);
        $first = $this->decodeResponse()['linkKey'];

        $this->post(self::URI, ['name' => 'Two', 'type' => 'wheel']);
        $second = $this->decodeResponse()['linkKey'];

        self::assertNotSame($first, $second);
        self::assertSame(LinkKey::LENGTH, \strlen($first));
    }

    /** F27 R33: a list of games needs something to call them. */
    public function testItRefusesAGameWithNoName(): void
    {
        $this->post(self::URI, ['name' => '   ', 'type' => 'wheel']);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('name', $this->decodeResponse()['error']['violations'][0]['field']);
    }

    public function testItRefusesAnUnknownKind(): void
    {
        $this->post(self::URI, ['name' => 'Black Friday', 'type' => 'tombola']);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('type', $this->decodeResponse()['error']['violations'][0]['field']);
    }

    /**
     * F04 R7, F30 R14. The whole list, in the admin's own order: the picker
     * is built from this and nothing else.
     */
    public function testItOffersExactlyTheseThemes(): void
    {
        $this->client->request('GET', self::URI);

        self::assertSame(
            ['plain', 'black-friday', 'christmas', 'new-year', 'halloween', 'birthday'],
            array_column($this->decodeResponse()['themes'], 'value'),
        );
    }

    // ----------------------------------------------------------- editing one

    /** F27 R40 */
    public function testItSavesTheNameTheTaglineAndTheLimit(): void
    {
        $this->put(self::URI.'/'.$this->gameId(), [
            'name' => 'Noel',
            'tagline' => 'Spin for a treat!',
            'dailyLimit' => 3,
        ]);

        self::assertResponseIsSuccessful();

        $body = $this->decodeResponse();

        self::assertSame('Noel', $body['name']);
        self::assertSame('Spin for a treat!', $body['ownTagline']);
        self::assertSame(3, $body['dailyLimit']);
    }

    /**
     * F27 R12, F04 R29. The admin edits their own value, and the type's
     * default is reported beside it rather than pre-filled into it.
     */
    public function testTheTypesDefaultTaglineIsUsedUntilTheAdminWritesOne(): void
    {
        $this->client->request('GET', self::URI.'/'.$this->gameId());

        $body = $this->decodeResponse();

        self::assertNull($body['ownTagline']);
        self::assertSame('One spin, one prize. Good luck.', $body['defaultTagline']);
    }

    /** F27 R12: clearing it is how a game goes back to the default. */
    public function testClearingTheTaglineReturnsToTheDefault(): void
    {
        $this->put(self::URI.'/'.$this->gameId(), ['name' => 'Noel', 'tagline' => 'Mine']);
        $this->put(self::URI.'/'.$this->gameId(), ['name' => 'Noel', 'tagline' => '']);

        self::assertNull($this->decodeResponse()['ownTagline']);
    }

    /** F27 R29, carrying F23 R4 over: 1 to 99, or blank. */
    public function testItRefusesALimitOfZero(): void
    {
        $this->put(self::URI.'/'.$this->gameId(), ['name' => 'Noel', 'dailyLimit' => 0]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('dailyLimit', $this->decodeResponse()['error']['violations'][0]['field']);
    }

    public function testItRefusesALimitOverNinetyNine(): void
    {
        $this->put(self::URI.'/'.$this->gameId(), ['name' => 'Noel', 'dailyLimit' => 100]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
    }

    /** F27 R29: blank is how a game says it has no limit. */
    public function testAnEmptyLimitIsNoLimit(): void
    {
        $this->put(self::URI.'/'.$this->gameId(), ['name' => 'Noel', 'dailyLimit' => 3]);
        $this->put(self::URI.'/'.$this->gameId(), ['name' => 'Noel', 'dailyLimit' => '']);

        self::assertNull($this->decodeResponse()['dailyLimit']);
    }

    /**
     * F27 R5. A type is chosen once. Refused rather than ignored: a client
     * that thinks it can change one would otherwise believe it had.
     */
    public function testItRefusesToChangeAGamesKind(): void
    {
        $this->put(self::URI.'/'.$this->gameId(), ['name' => 'Noel', 'type' => 'gift-sheet']);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('type', $this->decodeResponse()['error']['violations'][0]['field']);
    }

    /** F27 R29's neighbour: a game that is not there is a 404, not a 403. */
    public function testAGameThatDoesNotExistIsNotFound(): void
    {
        $this->client->request('GET', self::URI.'/9999');

        self::assertResponseStatusCodeSame(Response::HTTP_NOT_FOUND);
    }

    /** F30 R9. A game is plain until somebody says otherwise. */
    public function testANewGameIsPlain(): void
    {
        $this->post(self::URI, ['name' => 'Black Friday', 'type' => 'wheel']);

        self::assertSame('plain', $this->decodeResponse()['theme']);
    }

    /** F30 R1 */
    public function testItSavesTheTheme(): void
    {
        $this->put(self::URI.'/'.$this->gameId(), ['name' => 'Noel', 'theme' => 'christmas']);

        self::assertResponseIsSuccessful();
        self::assertSame('christmas', $this->decodeResponse()['theme']);

        $this->client->request('GET', self::URI.'/'.$this->gameId());
        self::assertSame('christmas', $this->decodeResponse()['theme']);
    }

    /**
     * F30 R3. Plain is a theme somebody chose, not an absence, so it has to
     * be storable over something else.
     */
    public function testItSavesPlainOverAnotherTheme(): void
    {
        $this->put(self::URI.'/'.$this->gameId(), ['name' => 'Noel', 'theme' => 'christmas']);
        $this->put(self::URI.'/'.$this->gameId(), ['name' => 'Noel', 'theme' => 'plain']);

        self::assertSame('plain', $this->decodeResponse()['theme']);
    }

    /** F30 section 10: an empty select is not a choice of a theme. */
    public function testAnEmptyOrAbsentThemeIsPlain(): void
    {
        $this->put(self::URI.'/'.$this->gameId(), ['name' => 'Noel', 'theme' => 'christmas']);

        $this->put(self::URI.'/'.$this->gameId(), ['name' => 'Noel', 'theme' => '']);
        self::assertSame('plain', $this->decodeResponse()['theme']);

        $this->put(self::URI.'/'.$this->gameId(), ['name' => 'Noel', 'theme' => 'christmas']);

        $this->put(self::URI.'/'.$this->gameId(), ['name' => 'Noel']);
        self::assertSame('plain', $this->decodeResponse()['theme']);
    }

    /** F04 R12, F30 R5 */
    public function testItRejectsAnUnknownTheme(): void
    {
        $this->put(self::URI.'/'.$this->gameId(), ['name' => 'Noel', 'theme' => 'easter']);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('theme', $this->decodeResponse()['error']['violations'][0]['field']);

        $this->client->request('GET', self::URI.'/'.$this->gameId());
        self::assertSame('plain', $this->decodeResponse()['theme'], 'Nothing should have been stored.');
    }

    /**
     * F30 R2. Two games, two looks: the whole point of the move, and the one
     * thing a store-wide theme could not do.
     */
    public function testEachGameKeepsItsOwnTheme(): void
    {
        $this->post(self::URI, ['name' => 'Gift sheet', 'type' => 'gift-sheet']);
        $second = $this->decodeResponse()['id'];

        $this->put(self::URI.'/'.$this->gameId(), ['name' => 'Noel', 'theme' => 'christmas']);
        $this->put(self::URI.'/'.$second, ['name' => 'Gift sheet', 'theme' => 'halloween']);

        $this->client->request('GET', self::URI);
        $themes = array_column($this->decodeResponse()['games'], 'theme', 'name');

        self::assertSame(['Noel' => 'christmas', 'Gift sheet' => 'halloween'], $themes);
    }

    // ------------------------------------------------------- live, or not

    /** F27 R42: reversible, with one control. */
    public function testItTurnsAGameOffAndOnAgain(): void
    {
        $id = $this->gameId();

        $this->put(self::URI.'/'.$id.'/live', ['live' => false]);
        self::assertFalse($this->decodeResponse()['isLive']);

        $this->put(self::URI.'/'.$id.'/live', ['live' => true]);
        self::assertTrue($this->decodeResponse()['isLive']);
    }

    /**
     * F27 R43. A 409 rather than a 422: the request is perfectly well formed
     * and the game is simply not ready, and a client has to tell those apart
     * to say anything useful.
     */
    public function testItRefusesToTurnLiveAWheelThatIsNotReady(): void
    {
        $this->post(self::URI, ['name' => 'Half done', 'type' => 'wheel']);
        $id = $this->decodeResponse()['id'];

        $this->put(self::URI.'/'.$id.'/live', ['live' => true]);

        self::assertResponseStatusCodeSame(Response::HTTP_CONFLICT);
        self::assertStringContainsString('wheel', $this->decodeResponse()['error']['message']);
    }

    /** F27 R43: the list says why before anybody presses the control. */
    public function testTheListSaysWhyAGameCannotGoLive(): void
    {
        $this->post(self::URI, ['name' => 'Half done', 'type' => 'wheel']);

        $this->client->request('GET', self::URI);

        $games = $this->decodeResponse()['games'];
        $created = array_values(array_filter(
            $games,
            static fn (array $game): bool => 'Half done' === $game['name'],
        ))[0];

        self::assertNotNull($created['notReady']);
    }

    /** A game that is ready says nothing, so the list stays quiet. */
    public function testAReadyGameHasNothingToReport(): void
    {
        $this->client->request('GET', self::URI);

        self::assertNull($this->decodeResponse()['games'][0]['notReady']);
    }

    public function testItRefusesALiveFlagThatIsNotABoolean(): void
    {
        $this->put(self::URI.'/'.$this->gameId().'/live', ['live' => 'yes']);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
    }

    // ------------------------------------------------------- the wheel's own

    /**
     * F27 R6, R40. One wheel per game, reached through the game — and a
     * wheel endpoint for a game that is not there says nothing about which
     * of the two was wrong.
     */
    public function testAWheelIsReachedThroughItsGame(): void
    {
        $this->client->request('GET', $this->wheelUri());
        self::assertResponseIsSuccessful();

        $this->client->request('GET', '/api/admin/games/9999/wheel');
        self::assertResponseStatusCodeSame(Response::HTTP_NOT_FOUND);
    }

    private function gameId(): int
    {
        $game = $this->entityManager->getRepository(Game::class)->findOneBy(['type' => GameType::Wheel->value]);
        \assert($game instanceof Game);

        $id = $game->getId();
        \assert(null !== $id);

        return $id;
    }
}
