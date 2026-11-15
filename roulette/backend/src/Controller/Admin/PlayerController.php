<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\Player;
use App\Player\PlayerPresenter;
use App\Repository\PlayerRepository;
use App\Repository\SpinRepository;
use Symfony\Bridge\Doctrine\Attribute\MapEntity;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Who played, and what each of them won (F08 R20–R23).
 *
 * Read-only. Editing or deleting a player is deliberately not here: a
 * deletion request is served from the console until there is a feature that
 * says what deleting a player should do to their spins (F08 section 14).
 *
 * Behind ROLE_ADMIN by the `^/api/admin` rule in security.yaml (F07 R17),
 * which is the only reason it is safe for this to be the one screen in the
 * project that puts personal data on a page.
 */
#[Route('/api/admin/players', name: 'api_admin_players_')]
final class PlayerController extends AbstractController
{
    public function __construct(
        private readonly PlayerRepository $players,
        private readonly SpinRepository $spins,
        private readonly PlayerPresenter $presenter,
    ) {
    }

    /** F08 R20, R21. */
    #[Route('', name: 'index', methods: ['GET'])]
    public function index(Request $request): JsonResponse
    {
        $filter = trim((string) $request->query->get('phone', ''));

        // Filtered on the stored form, not the canonical one: the admin is
        // typing a fragment — the last four digits off a receipt — and
        // canonicalising a fragment would reject it for being too short.
        $filter = '' === $filter ? null : $filter;
        $rows = $this->players->listWithSpinCounts($filter);

        return new JsonResponse([
            'players' => array_map(
                fn (array $row): array => $this->presenter->presentForAdmin($row['player'], $row['spinCount']),
                $rows,
            ),
            /**
             * F09 R21: how many match, not how many came back.
             *
             * This was `count($rows)` until F09, which is the length of a
             * capped list — so a shop with 600 customers would have read
             * "500 players" forever, and nothing on screen would have hinted
             * otherwise.
             */
            'total' => $this->players->countMatching($filter),
        ]);
    }

    /** F08 R22. */
    #[Route('/{id}', name: 'show', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function show(#[MapEntity(id: 'id')] Player $player): JsonResponse
    {
        $spins = $this->spins->findForPlayer($player);

        return new JsonResponse([
            // Counted from the history that was just loaded rather than with
            // a second query, since the limit is far above what a stall
            // produces and the two must agree on screen.
            'player' => $this->presenter->presentForAdmin($player, \count($spins)),
            'spins' => array_map(
                fn ($spin): array => $this->presenter->presentSpin($spin),
                $spins,
            ),
        ]);
    }
}
