<?php

declare(strict_types=1);

namespace App\Controller;

use App\Dto\PlayerInputParser;
use App\Dto\Violation;
use App\Entity\Player;
use App\Game\GameResolver;
use App\Player\PlayerPresenter;
use App\Player\PlayerRegistrar;
use App\Player\PlayerSession;
use App\Player\SpinAllowance;
use App\Repository\PlayerRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * The step in front of the wheel (F08).
 *
 * Named for what it does rather than for its resource, so it is not a second
 * PlayerController sitting beside the admin's one. These four routes are the
 * player's side of identification; App\Controller\Admin\PlayerController is
 * the admin's view of what they produced.
 *
 * Every route here is public, because asking who you are is the one thing
 * that cannot require knowing who you are.
 */
#[Route('/api/player', name: 'api_player_')]
final class IdentityController extends AbstractController
{
    public function __construct(
        private readonly PlayerInputParser $parser,
        private readonly PlayerRepository $players,
        private readonly PlayerRegistrar $registrar,
        private readonly PlayerSession $session,
        private readonly PlayerPresenter $presenter,
        private readonly SpinAllowance $allowance,
        private readonly GameResolver $resolver,
        private readonly TranslatorInterface $translator,
    ) {
    }

    /**
     * Who the page is talking to (F08 R13).
     *
     * A `200` with a null player, never a `401`. Not knowing who the visitor
     * is, is the normal state of this endpoint — see F08 section 8 for why a
     * 401 here would fire the admin's session-expired handling.
     */
    #[Route('/me', name: 'me', methods: ['GET'])]
    public function me(): JsonResponse
    {
        // F36: whose turn this is depends on which game is being played,
        // and the resolver is the one place that answers that (F27 R27).
        $game = $this->resolver->current();
        $player = null === $game ? null : $this->session->current($game);

        /*
         * F20 R5. What this identification won, so a reload draws the result
         * panel again instead of a working Spin button — and so the reward
         * code, which is the only copy in front of the player, survives it.
         *
         * Null for an identification that has not spun (F20 R9), and the key
         * is present either way so the page reads one shape.
         */
        $spin = null === $player || null === $game ? null : $this->session->spentSpin($game);

        return new JsonResponse([
            'player' => null === $player ? null : $this->presenter->presentForPlayer($player),
            'spin' => null === $spin ? null : $this->presenter->presentSpinForPlayer($spin),
            // F23 R12. Null for an unlimited campaign and for nobody at all:
            // a visitor with no identity has no day to count.
            'spinsLeft' => $this->spinsLeft($player),
        ]);
    }

    /**
     * F08 R5. A known number is identified here and now; an unknown one is
     * reported as unknown without anything being stored, so a mistyped
     * number leaves no row behind.
     */
    #[Route('/identify', name: 'identify', methods: ['POST'])]
    public function identify(Request $request): JsonResponse
    {
        $payload = $this->decode($request);

        if ($payload instanceof JsonResponse) {
            return $payload;
        }

        [$phone, $violations] = $this->parser->parsePhone($payload);

        if (null === $phone) {
            return $this->invalid($violations);
        }

        $player = $this->players->findForNumber($phone);

        if (null === $player) {
            // `player` is null rather than absent so the page reads one shape
            // whichever answer it gets.
            return new JsonResponse([
                'known' => false,
                'phone' => $phone,
                'player' => null,
                // Nobody is identified, so there is no allowance to report.
                // The key is present so the page reads one shape (F23 R13).
                'spinsLeft' => null,
            ]);
        }

        $this->identifyForTheGame($player);

        return new JsonResponse([
            'known' => true,
            'phone' => $phone,
            'player' => $this->presenter->presentForPlayer($player),
            /*
             * F23 R13. Answered here as well as by /me so that identifying
             * somebody who has used their day does not mean drawing a wheel
             * and then taking it away again — the page knows before it
             * renders anything.
             */
            'spinsLeft' => $this->spinsLeft($player),
        ]);
    }

    /** F08 R6, R7. */
    #[Route('/register', name: 'register', methods: ['POST'])]
    public function register(Request $request): JsonResponse
    {
        $payload = $this->decode($request);

        if ($payload instanceof JsonResponse) {
            return $payload;
        }

        [$draft, $violations] = $this->parser->parseRegistration($payload);

        if (null === $draft) {
            return $this->invalid($violations);
        }

        // Returns the existing player when the number is already taken
        // (F08 R7), so this is a 201 for the row it created and for the row
        // it found.
        //
        // F34 R9 does now distinguish the two, by sending the card only for
        // a customer this request created. The question that worried this
        // comment — "is this number already registered" — is one `identify`
        // answers directly and by design (F08 R12, `known`), so the card
        // tells a probing visitor nothing they could not already ask. What
        // it must never do is hand somebody else's card over, and that is
        // what `created` guards (F34 R8).
        $registered = $this->registrar->register($draft);
        $player = $registered->player;

        $this->identifyForTheGame($player);

        /*
         * F23 R13. A new registration has spun nothing and has the whole
         * allowance, but this is not hard-coded to the limit: register()
         * returns the existing player when the number is already taken
         * (F08 R7), and that person may well have played today.
         */
        return new JsonResponse(
            [
                'player' => $this->presenter->presentForPlayer($player),
                'spinsLeft' => $this->spinsLeft($player),
                // F34 R7, R9. Null for a customer who already existed.
                'card' => $registered->created ? $player->getCode() : null,
            ],
            Response::HTTP_CREATED,
        );
    }

    /**
     * F08 R14. Answers the same way whether or not anybody was identified:
     * the page's question is "stop being this player", and it has been.
     */
    #[Route('/forget', name: 'forget', methods: ['POST'])]
    public function forget(): JsonResponse
    {
        // F36 R4. The game on screen, and only that one: handing the phone
        // over at the wheel says nothing about a sheet this person may never
        // have opened.
        $game = $this->resolver->current();

        if (null !== $game) {
            $this->session->forget($game);
        }

        return new JsonResponse(null, Response::HTTP_NO_CONTENT);
    }

    /**
     * F36 R1. An identification belongs to a game, so there has to be one.
     *
     * With no game resolvable there is nothing to be identified *for*, and
     * the page could not play anything anyway — `/api/game` answers 409 and
     * `/api/play` would have bound one. The answer this endpoint gives is
     * still true: this number is known, or this registration happened.
     */
    private function identifyForTheGame(Player $player): void
    {
        $game = $this->resolver->current();

        if (null !== $game) {
            $this->session->identify($game, $player);
        }
    }

    /**
     * How many spins this person has left today, or null (F23 R12).
     *
     * One place, because three routes report it and a page that was told
     * two different numbers by two of them would show a wheel it then had
     * to withdraw.
     */
    private function spinsLeft(?Player $player): ?int
    {
        $game = $this->resolver->current();

        /*
         * F27 R30. Null when there is no game to count against, which is
         * the same answer as "no limit" and the right one: a page with no
         * game cannot play anything anyway, and the alternative is
         * inventing an allowance for a promotion nobody is running.
         */
        if (null === $player || null === $game) {
            return null;
        }

        return $this->allowance->remainingFor($player, $game);
    }

    /**
     * The decoded body, or the response to send instead.
     */
    private function decode(Request $request): mixed
    {
        try {
            return json_decode($request->getContent(), true, flags: \JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return $this->invalid([new Violation('', $this->translator->trans('api.invalid_json'))]);
        }
    }

    /**
     * The same envelope the rest of the API uses (F01 R12), so the SPA's
     * ApiValidationError puts each message on the field that caused it.
     *
     * @param list<Violation> $violations
     */
    private function invalid(array $violations): JsonResponse
    {
        return new JsonResponse(
            [
                'error' => [
                    'status' => Response::HTTP_UNPROCESSABLE_ENTITY,
                    'message' => $this->translator->trans('player.details_invalid'),
                    'violations' => array_map(
                        static fn (Violation $violation): array => $violation->toArray(),
                        $violations,
                    ),
                ],
            ],
            Response::HTTP_UNPROCESSABLE_ENTITY,
        );
    }
}
