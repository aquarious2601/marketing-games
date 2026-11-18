<?php

declare(strict_types=1);

namespace App\EventListener;

use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * Keeps the API honest: anything under /api answers with JSON, never with an
 * HTML error page (P00 R5).
 *
 * Without this, a 404 or an uncaught error reaches the SPA as a wall of HTML,
 * the fetch body fails to parse, and the real status code gets lost behind a
 * generic "something went wrong".
 */
#[AsEventListener(event: 'kernel.exception')]
final class ApiExceptionListener
{
    public function __construct(
        private readonly bool $debug,
        private readonly TranslatorInterface $translator,
    ) {
    }

    public function __invoke(ExceptionEvent $event): void
    {
        if (!str_starts_with($event->getRequest()->getPathInfo(), '/api')) {
            return;
        }

        $exception = $event->getThrowable();

        $status = $exception instanceof HttpExceptionInterface
            ? $exception->getStatusCode()
            : Response::HTTP_INTERNAL_SERVER_ERROR;

        $payload = [
            'error' => [
                'status' => $status,
                // Only expose the message for client errors. A 5xx message can
                // leak internals, so it is replaced unless we are debugging.
                'message' => $status < 500 || $this->debug
                    ? $exception->getMessage()
                    : $this->translator->trans('api.internal_error'),
            ],
        ];

        if ($this->debug) {
            $payload['error']['exception'] = $exception::class;
        }

        $headers = $exception instanceof HttpExceptionInterface
            ? $exception->getHeaders()
            : [];

        $event->setResponse(new JsonResponse($payload, $status, $headers));
    }
}
