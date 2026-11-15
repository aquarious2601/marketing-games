<?php

declare(strict_types=1);

namespace App\Tests\EventListener;

use App\EventListener\ApiExceptionListener;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Translation\Loader\YamlFileLoader;
use Symfony\Component\Translation\Translator;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\HttpKernelInterface;

/**
 * Unit coverage for the listener's decisions: which requests it claims, and
 * how much it is willing to say about a failure.
 */
final class ApiExceptionListenerTest extends TestCase
{
    public function testItIgnoresNonApiRequests(): void
    {
        $event = $this->eventFor('/admin', new NotFoundHttpException('nope'));

        (new ApiExceptionListener(debug: false, translator: self::translator()))($event);

        self::assertNull(
            $event->getResponse(),
            'Non-API paths should fall through to Symfony\'s normal error handling.',
        );
    }

    public function testItConvertsApiHttpExceptionsToJson(): void
    {
        $event = $this->eventFor('/api/missing', new NotFoundHttpException('No such thing'));

        (new ApiExceptionListener(debug: false, translator: self::translator()))($event);

        $response = $event->getResponse();
        self::assertNotNull($response);
        self::assertSame(Response::HTTP_NOT_FOUND, $response->getStatusCode());

        $payload = $this->decode($response);
        self::assertSame(Response::HTTP_NOT_FOUND, $payload['error']['status']);
        self::assertSame('No such thing', $payload['error']['message']);
    }

    public function testItHidesServerErrorDetailWhenNotDebugging(): void
    {
        $event = $this->eventFor('/api/boom', new \RuntimeException('DB password is hunter2'));

        (new ApiExceptionListener(debug: false, translator: self::translator()))($event);

        $response = $event->getResponse();
        self::assertNotNull($response);
        self::assertSame(Response::HTTP_INTERNAL_SERVER_ERROR, $response->getStatusCode());

        $body = (string) $response->getContent();
        self::assertStringNotContainsString('hunter2', $body, 'A 5xx must not leak internals.');
        self::assertSame('Internal server error', $this->decode($response)['error']['message']);
        self::assertArrayNotHasKey('exception', $this->decode($response)['error']);
    }

    public function testItRevealsServerErrorDetailWhenDebugging(): void
    {
        $event = $this->eventFor('/api/boom', new \RuntimeException('Something specific'));

        (new ApiExceptionListener(debug: true, translator: self::translator()))($event);

        $response = $event->getResponse();
        self::assertNotNull($response);

        $payload = $this->decode($response);
        self::assertSame('Something specific', $payload['error']['message']);
        self::assertSame(\RuntimeException::class, $payload['error']['exception']);
    }

    private function eventFor(string $path, \Throwable $exception): ExceptionEvent
    {
        return new ExceptionEvent(
            $this->createMock(HttpKernelInterface::class),
            Request::create($path),
            HttpKernelInterface::MAIN_REQUEST,
            $exception,
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function decode(Response $response): array
    {
        $decoded = json_decode((string) $response->getContent(), true, flags: \JSON_THROW_ON_ERROR);
        self::assertIsArray($decoded);

        return $decoded;
    }

    /**
     * A real translator over the real English file (F12 R16), so the message
     * this listener hides a 5xx behind is the one the application actually
     * sends — not a stub's echo of the key.
     */
    private static function translator(): Translator
    {
        $translator = new Translator('en');
        $translator->addLoader('yaml', new YamlFileLoader());
        $translator->addResource('yaml', __DIR__.'/../../translations/messages.en.yaml', 'en');

        return $translator;
    }
}
