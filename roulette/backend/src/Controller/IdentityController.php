<?php

declare(strict_types=1);

namespace App\Controller;

use App\Dto\PlayerInputParser;
use App\Dto\Violation;
use App\Player\PlayerPresenter;
use App\Player\PlayerRegistrar;
use App\Player\PlayerSession;
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
        $player = $this->session->current();

        return new JsonResponse([
            'player' => null === $player ? null : $this->presenter->presentForPlayer($player),
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

        $player = $this->players->findByPhone($phone);

        if (null === $player) {
            // `player` is null rather than absent so the page reads one shape
            // whichever answer it gets.
            return new JsonResponse(['known' => false, 'phone' => $phone, 'player' => null]);
        }

        $this->session->identify($player);

        return new JsonResponse([
            'known' => true,
            'phone' => $phone,
            'player' => $this->presenter->presentForPlayer($player),
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
        // it found. Distinguishing the two would tell the page whether a
        // number is already registered, which is exactly the question an
        // unidentified visitor should not be able to ask.
        $player = $this->registrar->register($draft);

        $this->session->identify($player);

        return new JsonResponse(
            ['player' => $this->presenter->presentForPlayer($player)],
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
        $this->session->forget();

        return new JsonResponse(null, Response::HTTP_NO_CONTENT);
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
