<?php

declare(strict_types=1);

namespace App\Controller;

use App\Branding\BrandingPresenter;
use App\Branding\BrandingProvider;
use App\Player\PlayerSession;
use App\Wheel\PlayerWheelPresenter;
use App\Wheel\SpinRecorder;
use App\Wheel\WheelProvider;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * What a player's browser is allowed to ask for.
 *
 * Both routes are reachable without an admin account and neither ever emits a
 * probability (F02 R2). Spinning now needs an identified player (F08 R16) —
 * the wheel itself stays open, because the page has to be able to draw before
 * it knows who is looking at it.
 *
 * How often an identified player may spin is still unlimited (F08 R18); see
 * F08 section 13 for why that is left to the eligibility feature.
 */
final class PlayerController extends AbstractController
{
    public function __construct(
        private readonly WheelProvider $provider,
        private readonly PlayerWheelPresenter $presenter,
        private readonly SpinRecorder $recorder,
        private readonly BrandingProvider $branding,
        private readonly BrandingPresenter $brandingPresenter,
        private readonly PlayerSession $session,
        private readonly TranslatorInterface $translator,
    ) {
    }

    #[Route('/api/wheel', name: 'api_wheel', methods: ['GET'])]
    public function wheel(): JsonResponse
    {
        // Branding travels with the wheel so the player page still loads in
        // one request (F04 section 8).
        return new JsonResponse([
            ...$this->presenter->present($this->provider->getOrCreate()),
            'branding' => $this->brandingPresenter->present($this->branding->getOrCreate()),
        ]);
    }

    #[Route('/api/spin', name: 'api_spin', methods: ['POST'])]
    public function spin(): JsonResponse
    {
        $player = $this->session->current();

        /**
         * F08 R16. A 403 rather than a 401 on purpose: the API client turns
         * every 401 into an application-wide "your session has gone" signal
         * for the admin (F07 R18), and an anonymous visitor pressing Spin is
         * not that. It is a request that is understood and refused.
         *
         * Nothing is drawn and nothing is recorded, which matters as much as
         * the status code: a refusal that still drew a prize would consume
         * stock the moment the eligibility feature gives prizes limits.
         */
        if (null === $player) {
            return new JsonResponse(
                [
                    'error' => [
                        'status' => Response::HTTP_FORBIDDEN,
                        'message' => $this->translator->trans('player.spin_requires_identity'),
                    ],
                ],
                Response::HTTP_FORBIDDEN,
            );
        }

        $spin = $this->recorder->spin($this->provider->getOrCreate(), $player);
        $prize = $spin->getPrize();

        // The prize cannot be null here: it was just drawn from the wheel and
        // persisted in the same transaction.
        \assert(null !== $prize);

        return new JsonResponse([
            'prize' => $this->presenter->presentPrize($prize),
            'spunAt' => $spin->getSpunAt()->format(\DateTimeInterface::ATOM),
        ]);
    }
}
