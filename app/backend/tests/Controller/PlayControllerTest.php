<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Entity\Game;
use App\Game\GameType;
use App\Tests\Support\DatabaseWebTestCase;
use Symfony\Component\HttpFoundation\Response;

/**
 * F27 R19–R28: where a player arrives.
 *
 * The rule that matters most here is R25, and it is the one a test has to
 * hold on to: a game that has been turned off and a key that was never
 * minted must be indistinguishable. Anything that tells them apart lets
 * somebody enumerate a shop's promotions.
 */
final class PlayControllerTest extends DatabaseWebTestCase
{
    /** F27 R20 */
    public function testAKeyResolvesToItsGame(): void
    {
        $this->client->request('GET', $this->playUri());

        self::assertResponseIsSuccessful();

        $body = $this->decodeResponse();

        self::assertSame('wheel', $body['type']);
        self::assertSame('Test campaign', $body['branding']['campaignName']);
    }

    /** F27 R20: the store's branding comes with it, so one request paints. */
    public function testItCarriesTheStoresBranding(): void
    {
        $this->client->request('GET', $this->playUri());

        self::assertSame(
            ['companyName', 'currency', 'currencySymbol', 'logoUrl', 'theme', 'campaignName', 'tagline'],
            array_keys($this->decodeResponse()['branding']),
        );
    }

    /** F27 R24 */
    public function testAGameThatIsNotLiveIsGone(): void
    {
        $this->turnTheGameOff();

        $this->client->request('GET', $this->playUri());

        self::assertResponseStatusCodeSame(Response::HTTP_NOT_FOUND);
    }

    /**
     * F27 R25. The whole rule in one assertion: same status, same body.
     *
     * A customer holding a printed link must not be able to tell a finished
     * promotion from a typo, and nobody poking at the installation may learn
     * that a key was ever real.
     */
    public function testAnEndedGameAndAnUnknownKeyAnswerIdentically(): void
    {
        $this->client->request('GET', '/api/play/q7mfd2xkbnrt');
        $unknownStatus = $this->client->getResponse()->getStatusCode();
        $unknownBody = $this->client->getResponse()->getContent();

        $this->turnTheGameOff();

        $this->client->request('GET', $this->playUri());

        self::assertSame($unknownStatus, $this->client->getResponse()->getStatusCode());
        self::assertSame($unknownBody, $this->client->getResponse()->getContent());
    }

    /** F27 R19, R25: a key that could not be one never reaches the database. */
    public function testAMalformedKeyIsTheSamePage(): void
    {
        $this->client->request('GET', '/api/play/NOT-A-KEY');

        self::assertResponseStatusCodeSame(Response::HTTP_NOT_FOUND);
    }

    /** F27 R25: neither page carries any shop's branding. */
    public function testThePageForAnUnknownKeyNamesNobody(): void
    {
        $this->client->request('GET', '/api/play/q7mfd2xkbnrt');

        $body = $this->decodeResponse();

        self::assertArrayNotHasKey('branding', $body);
        self::assertArrayNotHasKey('type', $body);
    }

    // --------------------------------------------------- what `/` still does

    /**
     * F27 R26. Exactly one game is live, which is what the upgrade leaves,
     * so the wheel is served without a key — and every link, bookmark and
     * printed QR code from before this feature keeps working.
     */
    public function testTheWheelIsServedWithoutAKeyWhileOneGameIsLive(): void
    {
        $this->client->request('GET', '/api/wheel');

        self::assertResponseIsSuccessful();
    }

    /**
     * F27 R26. With a second game live there is nothing for `/` to mean, and
     * the page says so rather than picking one.
     */
    public function testWithTwoGamesLiveThereIsNothingToServeWithoutAKey(): void
    {
        $second = new Game($this->store, 'Door prize', GameType::Wheel);
        $second->setLive(true);
        $this->entityManager->persist($second);
        $this->entityManager->flush();

        $this->client->request('GET', '/api/wheel');

        self::assertResponseStatusCodeSame(Response::HTTP_CONFLICT);
    }

    public function testWithNoGameLiveThereIsNothingToServeEither(): void
    {
        $this->turnTheGameOff();

        $this->client->request('GET', '/api/wheel');

        self::assertResponseStatusCodeSame(Response::HTTP_CONFLICT);
    }

    /**
     * F27 R27. The session decides, so a key opened once keeps working even
     * after a second game goes live and `/` stops being unambiguous.
     */
    public function testAKeyKeepsWorkingOnceASecondGameIsLive(): void
    {
        $this->client->request('GET', $this->playUri());
        self::assertResponseIsSuccessful();

        $second = new Game($this->store, 'Door prize', GameType::Wheel);
        $second->setLive(true);
        $this->entityManager->persist($second);
        $this->entityManager->flush();

        $this->client->request('GET', '/api/wheel');

        self::assertResponseIsSuccessful();
    }

    private function playUri(): string
    {
        return '/api/play/'.$this->game->getLinkKey();
    }

    private function turnTheGameOff(): void
    {
        $game = $this->entityManager->getRepository(Game::class)->find($this->game->getId());
        \assert($game instanceof Game);

        $game->setLive(false);
        $this->entityManager->flush();
    }
}
