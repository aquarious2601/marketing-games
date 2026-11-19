<?php

declare(strict_types=1);

namespace App\Controller;

use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Liveness probe.
 *
 * Deliberately touches no database and requires no authentication (P00 R4):
 * it must stay answerable even when everything behind it is broken, so that a
 * failure here means "the app is not serving" and nothing else.
 */
final class HealthController extends AbstractController
{
    public function __construct(
        #[Autowire('%app.name%')]
        private readonly string $appName,
        #[Autowire('%kernel.environment%')]
        private readonly string $appEnv,
        private readonly Connection $connection,
        private readonly bool $debug,
    ) {
    }

    #[Route('/api/health', name: 'api_health', methods: ['GET'])]
    public function __invoke(): JsonResponse
    {
        $payload = [
            'status' => 'ok',
            'app' => $this->appName,
            'env' => $this->appEnv,
            'time' => (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))
                ->format(\DateTimeInterface::ATOM),
        ];

        if ($this->debug) {
            // Which database this process is actually wired to. Read from the
            // connection parameters, never by querying, so P00 R4 still holds
            // and a dead database does not take the health check down with it.
            //
            // This exists because the end-to-end suite once ran against the
            // development database while claiming otherwise; a test now
            // asserts this value, so the isolation cannot silently lapse.
            $payload['database'] = $this->connection->getParams()['dbname'] ?? null;
        }

        return new JsonResponse($payload);
    }
}
