<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Branding\BrandingPresenter;
use App\Dto\Violation;
use App\Entity\Game;
use App\Repository\GameRepository;
use App\Stats\StatsReader;
use App\Store\StoreProvider;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * What the game costs and what it brings (F32).
 *
 * Read-only, and aggregates only: no row of this endpoint's output can be
 * traced back to one customer, which is deliberate — the module is about a
 * promotion, and the screen that is about a person is the counter's
 * ([F31](../../../features/F31-claiming-at-the-counter.md)).
 *
 * Behind ROLE_ADMIN by the `^/api/admin` rule in security.yaml (F07 R17).
 */
#[Route('/api/admin/stats', name: 'api_admin_stats_')]
final class StatsController extends AbstractController
{
    /** F32 R23. A promotion is read by the week. */
    private const DEFAULT_DAYS = 7;

    /**
     * The longest stretch this will answer for.
     *
     * A year, because the figures are per day and a reader asking for ten
     * would get a table nobody can read and a query nobody meant to run.
     */
    private const MAX_DAYS = 366;

    public function __construct(
        private readonly StatsReader $stats,
        private readonly GameRepository $games,
        private readonly StoreProvider $store,
        private readonly BrandingPresenter $presenter,
        private readonly TranslatorInterface $translator,
    ) {
    }

    #[Route('', name: 'index', methods: ['GET'])]
    public function index(Request $request): JsonResponse
    {
        $store = $this->store->getOrCreate();
        $zone = $store->getTimezoneAsZone();

        /*
         * Today in the *store's* zone (R18), not in the zone of whoever is
         * reading: an owner in France looking at a Vietnamese campaign must
         * see the shop's days, and they are the days a spin was counted in
         * (F23 R6).
         */
        $today = new \DateTimeImmutable('now', $zone);

        $violations = [];

        /*
         * `days` as well as a pair of dates, added while building (F32 §8).
         *
         * The days are the store's (R18) and a browser does not know which
         * zone that is, so a page asking for "the last 30 days" would have
         * to guess at the shop's today to name a first date. It asks for a
         * number instead and this works the dates out, which is the half
         * that holds the timezone.
         */
        $howMany = $this->readHowManyDays($request->query->get('days'), $violations);

        $to = $this->readDay($request->query->get('to'), $today, $violations, 'to');
        $from = null === $howMany
            ? $this->readDay(
                $request->query->get('from'),
                $today->modify(sprintf('-%d days', self::DEFAULT_DAYS - 1)),
                $violations,
                'from',
            )
            : $today->modify(sprintf('-%d days', $howMany - 1));

        if ([] === $violations && null !== $from && null !== $to) {
            $violations = $this->checkTheStretch($from, $to);
        }

        if ([] !== $violations || null === $from || null === $to) {
            return new JsonResponse(
                [
                    'error' => [
                        'status' => Response::HTTP_UNPROCESSABLE_ENTITY,
                        'message' => $this->translator->trans('stats.range_invalid'),
                        'violations' => array_map(
                            static fn (Violation $each): array => $each->toArray(),
                            $violations,
                        ),
                    ],
                ],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $game = $this->readGame($request);

        if ($game instanceof JsonResponse) {
            return $game;
        }

        // F15 R5: the shop's choice, or what the reader's language
        // suggests while there is none — the same answer the rest of the
        // admin gives.
        $currency = $store->currencyOr($this->presenter->defaultCurrency());

        return new JsonResponse([
            ...$this->stats->read($from, $to, $game),
            // R26: money is shown in the store's currency, so the symbol
            // travels with the figures rather than the page keeping a table.
            'currency' => $currency->value,
            'currencySymbol' => $currency->symbol(),
            // R20: how a reader is told that a percentage could not be
            // priced is a count of unpriced wins; this is why.
            'averageBasket' => $store->getAverageBasket(),
            // R19: the games to read separately, as the spin log does it.
            'games' => array_map(
                static fn (Game $each): array => ['id' => $each->getId(), 'name' => $each->getName()],
                $this->games->allOfTheStore(),
            ),
        ]);
    }

    /**
     * A date in the store's zone, or the default.
     *
     * Refused rather than clamped when it is not a date: a stats page built
     * from a URL nobody can read is worse than an error naming the field.
     *
     * @param list<Violation> $violations
     */
    private function readDay(
        mixed $raw,
        \DateTimeImmutable $default,
        array &$violations,
        string $field,
    ): ?\DateTimeImmutable {
        if (!\is_string($raw) || '' === trim($raw)) {
            return $default;
        }

        $day = \DateTimeImmutable::createFromFormat('!Y-m-d', trim($raw), $default->getTimezone());

        if (false === $day) {
            $violations[] = new Violation($field, $this->translator->trans('stats.day_invalid'));

            return null;
        }

        return $day;
    }

    /**
     * How many days back, or null when the caller named dates instead.
     *
     * @param list<Violation> $violations
     */
    private function readHowManyDays(mixed $raw, array &$violations): ?int
    {
        if (null === $raw || '' === $raw) {
            return null;
        }

        $days = filter_var($raw, \FILTER_VALIDATE_INT);

        if (false === $days || $days < 1 || $days > self::MAX_DAYS) {
            $violations[] = new Violation('days', $this->translator->trans('stats.range_too_long', [
                '%max%' => self::MAX_DAYS,
            ]));

            return null;
        }

        return $days;
    }

    /** @return list<Violation> */
    private function checkTheStretch(\DateTimeImmutable $from, \DateTimeImmutable $to): array
    {
        if ($from > $to) {
            return [new Violation('from', $this->translator->trans('stats.from_after_to'))];
        }

        $days = (int) $from->diff($to)->format('%a') + 1;

        if ($days > self::MAX_DAYS) {
            return [new Violation('to', $this->translator->trans('stats.range_too_long', [
                '%max%' => self::MAX_DAYS,
            ]))];
        }

        return [];
    }

    /** R19. One game, or every game. */
    private function readGame(Request $request): Game|JsonResponse|null
    {
        $id = $request->query->getInt('game');

        if (0 === $id) {
            return null;
        }

        $game = $this->games->find($id);

        if (null === $game) {
            return new JsonResponse(
                [
                    'error' => [
                        'status' => Response::HTTP_NOT_FOUND,
                        'message' => $this->translator->trans('game.not_found'),
                    ],
                ],
                Response::HTTP_NOT_FOUND,
            );
        }

        return $game;
    }
}
