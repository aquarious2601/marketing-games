<?php

declare(strict_types=1);

namespace App\Games\GiftSheet\Controller;

use App\Branding\BrandingPresenter;
use App\Entity\Game;
use App\Entity\Player;
use App\Entity\Spin;
use App\Game\GameResolver;
use App\Game\GameType;
use App\Games\GiftSheet\Repository\GiftRepository;
use App\Games\GiftSheet\SheetAllowance;
use App\Games\GiftSheet\SheetIssuer;
use App\Games\GiftSheet\SheetPresenter;
use App\Player\PlayerSession;
use App\Repository\SpinRepository;
use App\Store\StoreProvider;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * Playing a gift sheet (F28 R8–R20).
 *
 * The wheel's player endpoints are the model for this one, deliberately: the
 * identification, the refusals and their status codes are the same, because
 * they are the same rules (F08, F20, F23) and a second game is not a reason
 * to answer them differently.
 */
final class SheetController extends AbstractController
{
    public function __construct(
        private readonly GameResolver $resolver,
        private readonly GiftRepository $gifts,
        private readonly SheetIssuer $issuer,
        private readonly SheetAllowance $allowance,
        private readonly SheetPresenter $presenter,
        private readonly SpinRepository $spins,
        private readonly PlayerSession $session,
        private readonly StoreProvider $store,
        private readonly BrandingPresenter $branding,
        private readonly TranslatorInterface $translator,
    ) {
    }

    /**
     * What this game gives, with no codes (F28 §8).
     *
     * Shown before anybody presses anything, because a sheet has nothing to
     * hide: the player already knows they are getting everything on it, so
     * telling them what that is costs nothing and saves a surprise.
     */
    #[Route('/api/sheet', name: 'api_sheet', methods: ['GET'])]
    public function sheet(): JsonResponse
    {
        $game = $this->resolver->currentOfType(GameType::GiftSheet);

        if (null === $game) {
            return $this->noGame();
        }

        $player = $this->session->current();

        return new JsonResponse([
            'gifts' => $this->presenter->present($this->gifts->onSheet($game)),
            'branding' => $this->branding->presentForGame($this->store->getOrCreate(), $game),
            /*
             * F28 R18. The player's own sheet comes back on a reload, which
             * is not the refusal screen: this is the page they were already
             * looking at, for the session that was given it.
             */
            'issued' => null === $player
                ? null
                : $this->issuedFor($player, $game),
        ]);
    }

    /** F28 R9, R10: one request, the whole list, every code minted at once. */
    #[Route('/api/sheet', name: 'api_sheet_issue', methods: ['POST'])]
    public function issue(): JsonResponse
    {
        $game = $this->resolver->currentOfType(GameType::GiftSheet);

        if (null === $game) {
            return $this->noGame();
        }

        $player = $this->session->current();

        // F08 R16's rule, and its reasoning: a 403 rather than a 401,
        // because the API client turns every 401 into "your session has
        // gone" for the admin and an anonymous visitor pressing a button is
        // not that.
        if (null === $player) {
            return $this->refuse(
                Response::HTTP_FORBIDDEN,
                $this->translator->trans('player.spin_requires_identity'),
            );
        }

        /*
         * F28 R20, as F23 R10 refuses a spin. Before anything is minted, so
         * a refused request costs the shop nothing — which matters more here
         * than on a wheel, because a sheet gives away every reward on it.
         */
        if ($this->allowance->isExhausted($player, $game)) {
            return $this->refuse(
                Response::HTTP_TOO_MANY_REQUESTS,
                $this->translator->trans('player.spin_limit_reached'),
            );
        }

        if (0 === $this->gifts->countOnSheet($game)) {
            // R7 should have stopped this game going live. If it is somehow
            // live and empty, saying so is better than handing over nothing
            // and calling it a sheet.
            return $this->refuse(
                Response::HTTP_CONFLICT,
                $this->translator->trans('game.not_ready_empty_sheet'),
            );
        }

        return new JsonResponse(
            $this->presenter->presentIssued($this->issuer->issue($game, $player)),
            Response::HTTP_CREATED,
        );
    }

    /**
     * This session's own sheet, or null when it has not been given one.
     *
     * @return array{sheetId: string, gifts: list<array<string, mixed>>}|null
     */
    private function issuedFor(Player $player, Game $game): ?array
    {
        /** @var list<Spin> $rows */
        $rows = $this->spins->latestSheetFor($player, $game);

        return [] === $rows ? null : $this->presenter->presentIssued($rows);
    }

    private function noGame(): JsonResponse
    {
        return $this->refuse(
            Response::HTTP_CONFLICT,
            $this->translator->trans('player.no_game'),
        );
    }

    private function refuse(int $status, string $message): JsonResponse
    {
        return new JsonResponse(
            ['error' => ['status' => $status, 'message' => $message]],
            $status,
        );
    }
}
