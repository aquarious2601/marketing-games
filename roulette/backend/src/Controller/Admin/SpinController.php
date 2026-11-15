<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\Spin;
use App\Player\PlayerPresenter;
use App\Repository\SpinRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/**
 * The whole spin log (F09 R13–R20).
 *
 * The question this answers is "what went out today", which the per-player
 * history from F08 R22 cannot — see F09 R12 for why both exist rather than
 * one of them being the other with a filter applied.
 *
 * Behind ROLE_ADMIN by the `^/api/admin` rule in security.yaml (F07 R17).
 */
#[Route('/api/admin/spins', name: 'api_admin_spins_')]
final class SpinController extends AbstractController
{
    public function __construct(
        private readonly SpinRepository $spins,
        private readonly PlayerPresenter $presenter,
    ) {
    }

    #[Route('', name: 'index', methods: ['GET'])]
    public function index(Request $request): JsonResponse
    {
        $filter = trim((string) $request->query->get('phone', ''));
        $filter = '' === $filter ? null : $filter;

        $spins = $this->spins->listRecent($filter);

        return new JsonResponse([
            'spins' => array_map(
                fn (Spin $spin): array => $this->presenter->presentLoggedSpin($spin),
                $spins,
            ),
            /**
             * F09 R16, R21: how many match, not how many came back.
             *
             * Counted separately rather than taken from the array above,
             * which is capped. This is the number that lets the page say
             * "the most recent 200 of 1,432" instead of quietly presenting a
             * truncated list as the whole log.
             */
            'total' => $this->spins->countMatching($filter),
        ]);
    }
}
