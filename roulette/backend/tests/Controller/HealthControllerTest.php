<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\HttpFoundation\Response;

/**
 * Functional coverage for P00 R1–R5. Boots the real kernel and the real
 * router, so a broken service definition or a misplaced route fails here.
 */
final class HealthControllerTest extends WebTestCase
{
    private KernelBrowser $client;

    protected function setUp(): void
    {
        $this->client = static::createClient();
    }

    /** P00 R1 */
    public function testHealthReturnsOkWithJsonContentType(): void
    {
        $this->client->request('GET', '/api/health');

        self::assertResponseIsSuccessful();
        self::assertResponseStatusCodeSame(Response::HTTP_OK);
        self::assertResponseHeaderSame('Content-Type', 'application/json');
    }

    /** P00 R2 */
    public function testHealthBodyCarriesTheExpectedKeys(): void
    {
        $this->client->request('GET', '/api/health');

        $payload = $this->decodeBody();

        self::assertArrayHasKey('status', $payload);
        self::assertArrayHasKey('app', $payload);
        self::assertArrayHasKey('env', $payload);
        self::assertArrayHasKey('time', $payload);

        self::assertSame('ok', $payload['status']);
        self::assertSame('roulette', $payload['app']);
        self::assertSame('test', $payload['env'], 'The kernel environment should be reported, not hard-coded.');
    }

    /** P00 R3 */
    public function testHealthTimeIsIso8601Utc(): void
    {
        $this->client->request('GET', '/api/health');

        $time = $this->decodeBody()['time'];
        self::assertIsString($time);

        $parsed = \DateTimeImmutable::createFromFormat(\DateTimeInterface::ATOM, $time);
        self::assertInstanceOf(
            \DateTimeImmutable::class,
            $parsed,
            sprintf('"%s" is not an ISO 8601 timestamp.', $time),
        );
        self::assertSame(0, $parsed->getOffset(), 'The timestamp should be UTC.');

        // Guards against a frozen or wildly wrong clock.
        self::assertLessThan(
            60,
            abs($parsed->getTimestamp() - time()),
            'The reported time should be within a minute of now.',
        );
    }

    /** P00 R4 — no auth, and nothing that needs a database. */
    public function testHealthNeedsNoAuthentication(): void
    {
        $this->client->request('GET', '/api/health');

        self::assertResponseIsSuccessful();
        self::assertResponseStatusCodeSame(Response::HTTP_OK);
    }

    /** P00 R5 */
    public function testUnknownApiPathReturnsJsonNotFound(): void
    {
        $this->client->request('GET', '/api/this-route-does-not-exist');

        self::assertResponseStatusCodeSame(Response::HTTP_NOT_FOUND);
        self::assertResponseHeaderSame('Content-Type', 'application/json');

        $payload = $this->decodeBody();
        self::assertArrayHasKey('error', $payload);
        self::assertSame(Response::HTTP_NOT_FOUND, $payload['error']['status']);
    }

    /** P00 R5 — a wrong method is an API error too, so it must also be JSON. */
    public function testWrongMethodOnHealthReturnsJsonMethodNotAllowed(): void
    {
        $this->client->request('POST', '/api/health');

        self::assertResponseStatusCodeSame(Response::HTTP_METHOD_NOT_ALLOWED);
        self::assertResponseHeaderSame('Content-Type', 'application/json');
        self::assertArrayHasKey('error', $this->decodeBody());
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeBody(): array
    {
        $content = $this->client->getResponse()->getContent();
        self::assertIsString($content);

        $decoded = json_decode($content, true, flags: \JSON_THROW_ON_ERROR);
        self::assertIsArray($decoded);

        return $decoded;
    }
}
