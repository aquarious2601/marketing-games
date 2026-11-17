<?php

declare(strict_types=1);

namespace App\Controller;

use App\Branding\BrandingPresenter;
use App\Branding\BrandingProvider;
use App\Player\PlayerPresenter;
use App\Player\PlayerSession;
use App\Player\SpinAllowance;
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
 * One identification buys one spin (F20 R1), and a campaign may cap how
 * often a *person* may play in a day (F23 R1). The two are separate limits
 * and both are checked here: F20 is about this session, F23 is about the
 * person, and only the second one survives typing the number in again.
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
        private readonly PlayerPresenter $playerPresenter,
        private readonly SpinAllowance $allowance,
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

        /*
         * F20 R2. The server knows who this is and knows they have played,
         * so this is a conflict rather than a refusal to identify them: a 403
         * here would send the page back to the phone step and lose the result
         * it should be showing. A 409 lets it re-ask /api/player/me and draw
         * the prize it already won.
         *
         * Checked before the draw, so a refused request costs no prize and
         * mints no code (F16 R1).
         */
        if (null !== $this->session->spentSpin()) {
            return new JsonResponse(
                [
                    'error' => [
                        'status' => Response::HTTP_CONFLICT,
                        'message' => $this->translator->trans('player.spin_already_used'),
                    ],
                ],
                Response::HTTP_CONFLICT,
            );
        }

        /*
         * F23 R10. Checked after F20's conflict, because the two answer
         * different questions and the page draws a different screen for
         * each: a session that has spun should be shown what it won, even
         * when the day is also used up.
         *
         * A 429 rather than a 409 for the same reason F20 chose a 409 over
         * a 403 — the status is how the page tells the refusals apart
         * (F23 R11).
         *
         * Before the draw, so a refused request costs the shop no prize and
         * mints no code (F16 R1).
         */
        if ($this->allowance->isExhausted($player)) {
            return new JsonResponse(
                [
                    'error' => [
                        'status' => Response::HTTP_TOO_MANY_REQUESTS,
                        'message' => $this->translator->trans('player.spin_limit_reached'),
                    ],
                ],
                Response::HTTP_TOO_MANY_REQUESTS,
            );
        }

        $spin = $this->recorder->spin($this->provider->getOrCreate(), $player);
        $prize = $spin->getPrize();

        // The prize cannot be null here: it was just drawn from the wheel and
        // persisted in the same transaction.
        \assert(null !== $prize);

        /*
         * F20 R1, R3. After the spin is recorded, never before: marking it
         * first would cost a player their spin whenever the draw failed. The
         * window between the two is the risk written down in F20 section 13,
         * and it errs towards one extra spin rather than one lost prize.
         */
        $this->session->recordSpin($spin);

        return new JsonResponse([
            'prize' => $this->presenter->presentPrize($prize),
            /*
             * F13 R20. The type and value travel with the code because the
             * result panel renders "10% off" from them rather than parsing
             * the slice's label, which is the admin's words and may say
             * anything (F13 R8).
             *
             * Built by the presenter so that this and the reload answer
             * (F20 R5) cannot drift apart.
             */
            'reward' => $this->playerPresenter->presentReward($spin),
            'spunAt' => $spin->getSpunAt()->format(\DateTimeInterface::ATOM),
        ]);
    }
}
