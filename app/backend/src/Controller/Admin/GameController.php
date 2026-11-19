<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Branding\Theme;
use App\Dto\Violation;
use App\Entity\Game;
use App\Game\GameReadiness;
use App\Game\GameType;
use App\Repository\GameRepository;
use App\Repository\SpinRepository;
use App\Store\StoreProvider;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * The store's games (F27 R38–R43).
 *
 * What a game gives away is not here: a wheel's prize list is the wheel's
 * endpoint and a sheet's gifts are the sheet's, because those are the parts
 * that differ per type and this controller is the part that does not.
 */
#[Route('/api/admin/games', name: 'api_admin_games_')]
final class GameController extends AbstractController
{
    public function __construct(
        private readonly GameRepository $games,
        private readonly SpinRepository $spins,
        private readonly StoreProvider $store,
        private readonly GameReadiness $readiness,
        private readonly EntityManagerInterface $entityManager,
        private readonly TranslatorInterface $translator,
    ) {
    }

    /** F27 R38. */
    #[Route('', name: 'index', methods: ['GET'])]
    public function index(): JsonResponse
    {
        return new JsonResponse([
            'games' => array_map(
                fn (Game $game): array => $this->present($game),
                $this->games->allOfTheStore(),
            ),
            'types' => array_map(
                fn (GameType $type): array => [
                    'value' => $type->value,
                    'label' => $this->translator->trans('game.type_'.str_replace('-', '_', $type->value)),
                ],
                GameType::cases(),
            ),
            // F30 R14. The list the editor's picker is built from, moved
            // here with the picker itself.
            // F12 R9: the application's own words for each theme, in the
            // admin's language. What the admin *typed* is never translated.
            'themes' => array_map(
                fn (Theme $theme): array => [
                    'value' => $theme->value,
                    'label' => $this->translator->trans($theme->labelKey()),
                ],
                Theme::cases(),
            ),
            'maxDailyLimit' => Game::MAX_DAILY_LIMIT,
        ]);
    }

    /**
     * F27 R39. A name and a type, and nothing else.
     *
     * The game is created off, so a promotion nobody has configured is never
     * reachable by a link — and the key is minted now rather than on going
     * live, because R21 makes it permanent and a poster may be printed
     * before the prizes are decided.
     */
    #[Route('', name: 'create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $payload = $this->payload($request);

        if (!\is_array($payload)) {
            return $this->invalid([new Violation('', $this->translator->trans('api.invalid_object'))]);
        }

        $violations = [];
        $name = $this->readName($payload, $violations);
        $type = $this->readType($payload, $violations);

        if ([] !== $violations || null === $name || null === $type) {
            return $this->invalid($violations);
        }

        $game = new Game($this->store->getOrCreate(), $name, $type);

        $this->entityManager->persist($game);
        $this->entityManager->flush();

        return new JsonResponse($this->present($game), Response::HTTP_CREATED);
    }

    #[Route('/{id}', name: 'show', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function show(int $id): JsonResponse
    {
        $game = $this->games->find($id);

        return null === $game
            ? $this->notFound()
            : new JsonResponse($this->present($game));
    }

    /** F27 R40. The game's own fields; what it gives away lives elsewhere. */
    #[Route('/{id}', name: 'update', methods: ['PUT'], requirements: ['id' => '\d+'])]
    public function update(int $id, Request $request): JsonResponse
    {
        $game = $this->games->find($id);

        if (null === $game) {
            return $this->notFound();
        }

        $payload = $this->payload($request);

        if (!\is_array($payload)) {
            return $this->invalid([new Violation('', $this->translator->trans('api.invalid_object'))]);
        }

        $violations = [];
        $name = $this->readName($payload, $violations);
        $tagline = $this->readTagline($payload, $violations);
        $limit = $this->readDailyLimit($payload, $violations);
        $theme = $this->readTheme($payload, $violations);

        /*
         * F27 R5. A payload naming a different type is refused rather than
         * ignored: a client that thinks it can change one would otherwise
         * believe it had.
         */
        if (\array_key_exists('type', $payload) && $payload['type'] !== $game->getType()->value) {
            $violations[] = new Violation('type', $this->translator->trans('game.type_is_fixed'));
        }

        if ([] !== $violations || null === $name) {
            return $this->invalid($violations);
        }

        $game->setName($name);
        $game->setTagline($tagline);
        $game->setDailyLimit($limit);
        $game->setTheme($theme ?? Theme::Plain);

        $this->entityManager->flush();

        return new JsonResponse($this->present($game));
    }

    /**
     * F27 R42, R43. One control, no confirmation step: it is reversible, and
     * turning a game off is visible to anybody holding its link anyway.
     */
    #[Route('/{id}/live', name: 'live', methods: ['PUT'], requirements: ['id' => '\d+'])]
    public function live(int $id, Request $request): JsonResponse
    {
        $game = $this->games->find($id);

        if (null === $game) {
            return $this->notFound();
        }

        $payload = $this->payload($request);
        $live = \is_array($payload) ? ($payload['live'] ?? null) : null;

        if (!\is_bool($live)) {
            return $this->invalid([new Violation('live', $this->translator->trans('game.live_must_be_boolean'))]);
        }

        if ($live) {
            $why = $this->readiness->whyNotLive($game);

            /*
             * A 409 rather than a 422: the request is perfectly well formed
             * and the game is simply not ready, and a client has to tell
             * those apart to say anything useful (as F27 R12 has it for the
             * profile).
             */
            if (null !== $why) {
                return new JsonResponse(
                    ['error' => ['status' => Response::HTTP_CONFLICT, 'message' => $why]],
                    Response::HTTP_CONFLICT,
                );
            }
        }

        $game->setLive($live);
        $this->entityManager->flush();

        return new JsonResponse($this->present($game));
    }

    /**
     * @return array<string, mixed>
     */
    private function present(Game $game): array
    {
        return [
            'id' => $game->getId(),
            'name' => $game->getName(),
            'type' => $game->getType()->value,
            'ownTagline' => $game->getOwnTagline(),
            'defaultTagline' => $this->translator->trans($game->defaultTaglineKey()),
            'dailyLimit' => $game->getDailyLimit(),
            // F30 R1
            'theme' => $game->getTheme()->value,
            'linkKey' => $game->getLinkKey(),
            // F27 R41: the path, which the page turns into the whole URL
            // with its own origin.
            'playPath' => $this->playPath($game),
            'isLive' => $game->isLive(),
            'plays' => $this->spins->countForGame($game),
            'notReady' => $this->readiness->whyNotLive($game),
        ];
    }

    /**
     * F27 R41. The path only; the page puts its own origin in front of it.
     *
     * This used to return the whole URL built from the request's host, which
     * is wrong wherever the API and the page are not served from the same
     * place — in development the API answers on 127.0.0.1:8000 and the app
     * is served by Vite on localhost:5173, so the admin copied a link to the
     * API and it 404ed. The browser is the only thing that knows where the
     * page lives, so the browser builds it.
     */
    private function playPath(Game $game): string
    {
        return '/play/'.$game->getLinkKey();
    }

    /**
     * F30 R1, section 10. Absent, null or empty means `plain`: an empty select
     * is not a choice of a theme that does not exist. This is the store's
     * reader, moved here with the field.
     *
     * @param array<mixed>    $payload
     * @param list<Violation> $violations
     */
    private function readTheme(array $payload, array &$violations): ?Theme
    {
        /** @var mixed $value */
        $value = $payload['theme'] ?? null;

        if (null === $value || '' === $value) {
            return Theme::Plain;
        }

        // F04 R12: an unrecognised theme is rejected on the way in. The
        // forgiving fallback is only for values already in the database.
        $theme = \is_string($value) ? Theme::tryFrom($value) : null;

        if (null === $theme) {
            $violations[] = new Violation(
                'theme',
                $this->translator->trans('branding.choose_one_of', [
                    '%values%' => implode(', ', array_map(static fn (Theme $t): string => $t->value, Theme::cases())),
                ]),
            );
        }

        return $theme;
    }

    /** @param array<mixed> $payload */
    private function readName(array $payload, array &$violations): ?string
    {
        /** @var mixed $value */
        $value = $payload['name'] ?? null;
        $name = \is_string($value) ? trim($value) : '';

        if ('' === $name) {
            $violations[] = new Violation('name', $this->translator->trans('game.name_required'));

            return null;
        }

        if (mb_strlen($name) > Game::NAME_MAX_LENGTH) {
            $violations[] = new Violation('name', $this->translator->trans('game.name_too_long', [
                '%max%' => Game::NAME_MAX_LENGTH,
            ]));

            return null;
        }

        return $name;
    }

    /** @param array<mixed> $payload */
    private function readType(array $payload, array &$violations): ?GameType
    {
        /** @var mixed $value */
        $value = $payload['type'] ?? null;

        if (!\is_string($value) || null === ($type = GameType::tryFrom($value))) {
            $violations[] = new Violation('type', $this->translator->trans('game.type_invalid'));

            return null;
        }

        return $type;
    }

    /** @param array<mixed> $payload */
    private function readTagline(array $payload, array &$violations): ?string
    {
        /** @var mixed $value */
        $value = $payload['tagline'] ?? null;

        if (null === $value || '' === $value) {
            return null;
        }

        if (!\is_string($value) || mb_strlen(trim($value)) > Game::TAGLINE_MAX_LENGTH) {
            $violations[] = new Violation('tagline', $this->translator->trans('game.tagline_too_long', [
                '%max%' => Game::TAGLINE_MAX_LENGTH,
            ]));

            return null;
        }

        return trim($value);
    }

    /**
     * F27 R29, carrying F23 R4's rules over: a whole number from 1 to 99, or
     * blank for no limit. Zero stays refused — a game nobody may play is a
     * mistake rather than a setting.
     *
     * @param array<mixed> $payload
     */
    private function readDailyLimit(array $payload, array &$violations): ?int
    {
        /** @var mixed $value */
        $value = $payload['dailyLimit'] ?? null;

        if (null === $value || '' === $value) {
            return null;
        }

        $limit = null;

        if (\is_int($value)) {
            $limit = $value;
        } elseif (\is_string($value) && 1 === preg_match('/^\d{1,3}$/', $value)) {
            $limit = (int) $value;
        }

        if (null === $limit || $limit < 1 || $limit > Game::MAX_DAILY_LIMIT) {
            $violations[] = new Violation('dailyLimit', $this->translator->trans('game.daily_limit_invalid', [
                '%max%' => Game::MAX_DAILY_LIMIT,
            ]));

            return null;
        }

        return $limit;
    }

    private function payload(Request $request): mixed
    {
        try {
            return json_decode($request->getContent(), true, flags: \JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }
    }

    /** @param list<Violation> $violations */
    private function invalid(array $violations): JsonResponse
    {
        return new JsonResponse(
            [
                'error' => [
                    'status' => Response::HTTP_UNPROCESSABLE_ENTITY,
                    'message' => $this->translator->trans('api.validation_failed'),
                    'violations' => array_map(
                        fn (Violation $violation): array => $violation->toArray(),
                        $violations,
                    ),
                ],
            ],
            Response::HTTP_UNPROCESSABLE_ENTITY,
        );
    }

    /** F27 R29's neighbour: a game id that is not ours is a 404, not a 403. */
    private function notFound(): JsonResponse
    {
        return new JsonResponse(
            ['error' => ['status' => Response::HTTP_NOT_FOUND, 'message' => $this->translator->trans('game.not_found')]],
            Response::HTTP_NOT_FOUND,
        );
    }
}
