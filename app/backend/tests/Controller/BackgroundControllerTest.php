<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Branding\Theme;
use App\Tests\Support\DatabaseWebTestCase;
use Symfony\Component\HttpFoundation\Response;

/**
 * F35 R13, R14. The one route that reaches an uploaded picture.
 *
 * Uploads live outside the web root, so everything about how this answers —
 * the type it declares, the header that stops a browser improving on it, and
 * the single answer it gives to every way of not having a picture — is this
 * route's business and nobody else's.
 */
final class BackgroundControllerTest extends DatabaseWebTestCase
{
    /** @var list<string> */
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

    public function testItServesTheGamesPicture(): void
    {
        $this->pictures[] = $this->giveTheGameAPicture();

        $this->client->request('GET', $this->uri());

        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('Content-Type', 'image/png');
        self::assertResponseHeaderSame('X-Content-Type-Options', 'nosniff');
    }

    /**
     * Not gated on the game being live: the admin looks at this URL while a
     * promotion is still being built.
     */
    public function testItServesThePictureOfAGameThatIsNotLive(): void
    {
        $this->pictures[] = $this->giveTheGameAPicture();
        $this->game->setLive(false);
        $this->entityManager->flush();

        $this->client->request('GET', $this->uri());

        self::assertResponseIsSuccessful();
    }

    /** F35 R15. The record says yes and the disk says no. */
    public function testAMissingFileIsNotFound(): void
    {
        $path = $this->giveTheGameAPicture();
        unlink($path);

        $this->client->request('GET', $this->uri());

        self::assertResponseStatusCodeSame(Response::HTTP_NOT_FOUND);
    }

    public function testAGameWithNoPictureIsNotFound(): void
    {
        $this->client->request('GET', $this->uri());

        self::assertResponseStatusCodeSame(Response::HTTP_NOT_FOUND);
    }

    /**
     * One answer for every way of not having a picture, so nothing here can
     * be used to tell a real key from an invented one.
     */
    public function testAKeyThatNamesNoGameIsNotFound(): void
    {
        $this->client->request('GET', '/api/branding/background/abcd1234abcd1234');

        self::assertResponseStatusCodeSame(Response::HTTP_NOT_FOUND);
    }

    public function testSomethingThatIsNotAKeyIsNotFound(): void
    {
        $this->client->request('GET', '/api/branding/background/not-a-key');

        self::assertResponseStatusCodeSame(Response::HTTP_NOT_FOUND);
    }

    /** F35 R7, R13. A JPEG is served as one, from the name the store gave it. */
    public function testItServesEachKindAsItself(): void
    {
        $this->pictures[] = $this->giveTheGameAPicture(Theme::Plain, 'f35-test.jpg');

        $this->client->request('GET', $this->uri());

        self::assertResponseHeaderSame('Content-Type', 'image/jpeg');
    }

    private function uri(): string
    {
        return '/api/branding/background/'.$this->game->getLinkKey();
    }
}
