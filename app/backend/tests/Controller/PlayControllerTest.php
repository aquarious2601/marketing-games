<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Branding\Theme;
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
    /** @var list<string> Pictures written to the upload directory. */
    private array $pictures = [];

    protected function tearDown(): void
    {
        foreach ($this->pictures as $path) {
            if (is_file($path)) {
                @unlink($path);
            }
        }

        $this->pictures = [];

        parent::tearDown();
    }

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
            [
                'companyName',
                'currency',
                'currencySymbol',
                'logoUrl',
                'theme',
                'backgroundUrl',
                'campaignName',
                'tagline',
            ],
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

    // ---------------------------------------------- a theme of one's own

    /**
     * F35 R2, section 8. The page is told the palette and handed a picture.
     * It is never told the word "custom", because it has no colours under
     * that name.
     */
    public function testACustomThemeArrivesAsItsBaseAndAPicture(): void
    {
        $this->pictures[] = $this->giveTheGameAPicture(Theme::Birthday);

        $this->client->request('GET', $this->playUri());

        $branding = $this->decodeResponse()['branding'];

        self::assertSame('birthday', $branding['theme']);
        self::assertStringContainsString(
            '/api/branding/background/'.$this->game->getLinkKey(),
            (string) $branding['backgroundUrl'],
        );
    }

    /** F35 R4. Custom with nothing uploaded is its base theme, and nothing else. */
    public function testACustomThemeWithNoPictureIsJustItsBase(): void
    {
        $this->pictures[] = $this->giveTheGameAPicture(Theme::Christmas);
        $this->game->setBackground(null);
        $this->entityManager->flush();

        $this->client->request('GET', $this->playUri());

        $branding = $this->decodeResponse()['branding'];

        self::assertSame('christmas', $branding['theme']);
        self::assertNull($branding['backgroundUrl']);
    }

    /**
     * F35 R15. The record says there is a picture and the disk disagrees.
     * The page loses its decoration, not its readability.
     */
    public function testAPictureThatWentMissingIsNoPicture(): void
    {
        $path = $this->giveTheGameAPicture(Theme::Halloween);
        unlink($path);

        $this->client->request('GET', $this->playUri());

        $branding = $this->decodeResponse()['branding'];

        self::assertSame('halloween', $branding['theme']);
        self::assertNull($branding['backgroundUrl']);
    }

    /** F35 R5. A picture kept through a change of theme is not shown by it. */
    public function testAGameThatIsNotCustomShowsNoPicture(): void
    {
        $this->pictures[] = $this->giveTheGameAPicture(Theme::Birthday);
        $this->game->setTheme(Theme::Christmas);
        $this->entityManager->flush();

        $this->client->request('GET', $this->playUri());

        $branding = $this->decodeResponse()['branding'];

        self::assertSame('christmas', $branding['theme']);
        self::assertNull($branding['backgroundUrl']);
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
