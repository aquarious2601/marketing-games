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
        /*
         * F31 R1. `search` rather than `phone`, because the box takes a
         * code as well — the same rename F16 made on the spins endpoint,
         * and for the same reason: a parameter named after one of the two
         * things it accepts lies to whoever reads it next.
         */
        $filter = trim((string) $request->query->get('search', ''));

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
            /*
             * F31 R7. True when nothing matched because the code names a
             * win that belongs to nobody — a spin from before F08, or one
             * whose customer was deleted. The page says so and names the
             * Spins module instead of reporting a flat nothing: the shop
             * still owes somebody that prize.
             */
            'winWithoutCustomer' => [] === $rows
                && $this->spins->hasWinWithoutCustomer($filter),
        ]);
    }

    /**
     * One customer, and everything they are owed (F08 R22, F31 R10-R14).
     *
     * The counter's screen. Both counts come from the database rather
     * than from the array above, because the array is wins only now and
     * counting it would say a customer who lost nine times played three.
     */
    #[Route('/{id}', name: 'show', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function show(#[MapEntity(id: 'id')] Player $player): JsonResponse
    {
        $wins = $this->spins->findWinsForPlayer($player);
        $played = $this->players->countSpins($player);

        return new JsonResponse([
            'player' => $this->presenter->presentForAdmin($player, $played),
            /*
             * F31 R11. Their wins, not their spins. The losing ones are the
             * two counts below — R13: a page that says "played 12, won 3"
             * and lists three is hiding nothing, where a page that lists
             * three and says nothing about the other nine is.
             */
            'wins' => array_map(
                fn ($spin): array => $this->presenter->presentWin($spin),
                $wins,
            ),
            'played' => $played,
            'won' => \count($wins),
        ]);
    }
}
