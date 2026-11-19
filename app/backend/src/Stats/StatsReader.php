<?php

declare(strict_types=1);

namespace App\Stats;

use App\Entity\Game;
use App\Reward\RewardType;
use App\Store\StoreProvider;
use Doctrine\DBAL\Connection;

/**
 * What the game costs and brings, counted by the database (F32 R12–R21).
 *
 * Every figure here is an aggregate, never a row count in PHP (R27): the
 * spin log is the one table in this application that grows without limit,
 * and a stats page that loaded a month of it to count would be the first
 * thing to fall over on a shop's best week.
 *
 * Days are the **store's** days (R18), the same days a spin is counted in
 * (F23 R6). Their boundaries are worked out in PHP from the store's zone and
 * sent as instants, rather than converted in SQL: `CONVERT_TZ` needs
 * MariaDB's timezone tables loaded, which is not something this application
 * can require of a shop's server, and a fixed offset would be wrong twice a
 * year wherever the clocks change.
 */
final class StatsReader
{
    public function __construct(
        private readonly Connection $connection,
        private readonly StoreProvider $store,
    ) {
    }

    /**
     * @return array{
     *     from: string,
     *     to: string,
     *     totals: array<string, int|float|null>,
     *     days: list<array<string, int|float|string|null>>,
     * }
     */
    public function read(\DateTimeImmutable $from, \DateTimeImmutable $to, ?Game $game = null): array
    {
        $zone = $this->store->getOrCreate()->getTimezoneAsZone();
        $days = [];

        /*
         * Newest day first, like every other list in this admin. A day with
         * nothing in it is a row of zeros rather than a missing row (R25):
         * a gap in a table of days reads as a fault.
         */
        for ($day = $to; $day >= $from; $day = $day->modify('-1 day')) {
            $start = new \DateTimeImmutable($day->format('Y-m-d').' 00:00:00', $zone);
            $end = $start->modify('+1 day');

            $days[] = ['day' => $day->format('Y-m-d')] + $this->between($start, $end, $game);
        }

        $rangeStart = new \DateTimeImmutable($from->format('Y-m-d').' 00:00:00', $zone);
        $rangeEnd = (new \DateTimeImmutable($to->format('Y-m-d').' 00:00:00', $zone))->modify('+1 day');

        /*
         * The totals are their own query rather than the sum of the days
         * above, because customers do not add up: somebody who played on
         * Monday and again on Friday is one customer over the week (R12,
         * R19) and two if the days are added together.
         */
        $totals = $this->between($rangeStart, $rangeEnd, $game)
            + ['medianDelaySeconds' => $this->medianDelay($rangeStart, $rangeEnd, $game)];

        return [
            'from' => $from->format('Y-m-d'),
            'to' => $to->format('Y-m-d'),
            'totals' => $totals,
            'days' => $days,
        ];
    }

    /**
     * Every figure for one stretch, in two queries.
     *
     * Two rather than one because they are counted on different columns:
     * what was *issued* belongs to the day it was won, and what was
     * *collected* belongs to the day it was handed over (R15). A single
     * query would have to choose one of those and would then be wrong about
     * the other.
     *
     * @return array<string, int|float|null>
     */
    private function between(
        \DateTimeImmutable $start,
        \DateTimeImmutable $end,
        ?Game $game,
    ): array {
        $issued = $this->issuedBetween($start, $end, $game);
        $collected = $this->collectedBetween($start, $end, $game);

        $wins = $issued['wins'];
        $collectedOfThose = $issued['collectedOfThose'];

        return [
            'customers' => $issued['customers'],
            'newCustomers' => $issued['newCustomers'],
            // R13: the two add up to the customers above, so the page never
            // has to subtract to find the ones it did not name.
            'returningCustomers' => $issued['customers'] - $issued['newCustomers'],
            'plays' => $issued['plays'],
            'wins' => $wins,
            // R14: stated rather than left to subtraction.
            'wonNothing' => $issued['plays'] - $wins,
            'issuedCost' => $issued['cost'],
            'unpricedIssued' => $issued['unpriced'],
            'collected' => $collected['collected'],
            'collectedCost' => $collected['cost'],
            'unpricedCollected' => $collected['unpriced'],
            // R15: what is still owed from what this stretch issued.
            'outstanding' => $wins - $collectedOfThose,
            /*
             * R16. Of the wins issued in this stretch, the share collected
             * **as of now** — which is why the page says so out loud:
             * yesterday's rate will be higher tomorrow.
             *
             * R21: nothing to divide by is null, never a zero that reads as
             * "nobody came back".
             */
            'collectionRate' => 0 === $wins ? null : round($collectedOfThose / $wins, 4),
        ];
    }

    /**
     * @return array{plays: int, wins: int, customers: int, newCustomers: int, cost: int, unpriced: int, collectedOfThose: int}
     */
    private function issuedBetween(
        \DateTimeImmutable $start,
        \DateTimeImmutable $end,
        ?Game $game,
    ): array {
        /*
         * `newCustomers` asks whether this customer has any spin before the
         * stretch (R13) rather than reading `player.created_at`. The two
         * agree today — a player row is written when somebody identifies —
         * and the question is about playing, not about registering, so it is
         * asked of the spins.
         */
        $sql = <<<'SQL'
            SELECT
                COUNT(*) AS plays,
                SUM(CASE WHEN s.reward_type <> :nothing THEN 1 ELSE 0 END) AS wins,
                COUNT(DISTINCT s.player_id) AS customers,
                COUNT(DISTINCT CASE WHEN NOT EXISTS (
                    SELECT 1 FROM spin earlier
                    WHERE earlier.player_id = s.player_id AND earlier.spun_at < :start
                ) THEN s.player_id END) AS newCustomers,
                SUM(CASE WHEN s.reward_type <> :nothing THEN COALESCE(s.reward_cost, 0) ELSE 0 END) AS cost,
                SUM(CASE WHEN s.reward_type <> :nothing AND s.reward_cost IS NULL THEN 1 ELSE 0 END) AS unpriced,
                SUM(CASE WHEN s.reward_type <> :nothing AND s.claimed_at IS NOT NULL THEN 1 ELSE 0 END) AS collectedOfThose
            FROM spin s
            WHERE s.spun_at >= :start AND s.spun_at < :end
            SQL;

        return $this->counts($sql, $start, $end, $game, 's');
    }

    /** @return array{collected: int, cost: int, unpriced: int} */
    private function collectedBetween(
        \DateTimeImmutable $start,
        \DateTimeImmutable $end,
        ?Game $game,
    ): array {
        /*
         * R15. Counted on `claimed_at`, because this is the day the shop
         * actually spent the money — a voucher won in October and collected
         * in November cost November.
         */
        $sql = <<<'SQL'
            SELECT
                COUNT(*) AS collected,
                SUM(COALESCE(s.reward_cost, 0)) AS cost,
                SUM(CASE WHEN s.reward_cost IS NULL THEN 1 ELSE 0 END) AS unpriced
            FROM spin s
            WHERE s.claimed_at >= :start AND s.claimed_at < :end
            SQL;

        /** @var array{collected: int, cost: int, unpriced: int} $row */
        $row = $this->counts($sql, $start, $end, $game, 's');

        return $row;
    }

    /**
     * R17. The median time between a win and its collection, in seconds.
     *
     * The median rather than the mean, because one voucher collected after
     * three months would otherwise rewrite a busy afternoon. Taken with
     * `LIMIT`/`OFFSET` over the ordered delays rather than by loading them,
     * so R27 holds here too.
     */
    private function medianDelay(
        \DateTimeImmutable $start,
        \DateTimeImmutable $end,
        ?Game $game,
    ): ?int {
        $where = 's.claimed_at IS NOT NULL AND s.spun_at >= :start AND s.spun_at < :end';
        $parameters = ['start' => $this->instant($start), 'end' => $this->instant($end)];

        if (null !== $game) {
            $where .= ' AND s.game_id = :game';
            $parameters['game'] = $game->getId();
        }

        $howMany = (int) $this->connection->fetchOne(
            'SELECT COUNT(*) FROM spin s WHERE '.$where,
            $parameters,
        );

        if (0 === $howMany) {
            return null;
        }

        /*
         * The lower of the two middle values on an even count, rather than
         * their mean. A median of delays is read as "about this long", and
         * half a second of arithmetic precision on top of that would be
         * precision the figure does not have.
         */
        $middle = intdiv($howMany - 1, 2);

        $delay = $this->connection->fetchOne(
            'SELECT TIMESTAMPDIFF(SECOND, s.spun_at, s.claimed_at) AS delay '
            .'FROM spin s WHERE '.$where.' ORDER BY delay ASC LIMIT 1 OFFSET '.$middle,
            $parameters,
        );

        return false === $delay ? null : (int) $delay;
    }

    /**
     * Runs one of the aggregates above, adding the game filter (R19) and
     * casting what comes back.
     *
     * The cast matters: `SUM` over no rows is SQL NULL and `COUNT` comes
     * back as a string on some drivers, so without this a quiet day would
     * reach the page as `null` and read as a failure rather than as nothing
     * having happened (R21, R25).
     *
     * @return array<string, int>
     */
    private function counts(
        string $sql,
        \DateTimeImmutable $start,
        \DateTimeImmutable $end,
        ?Game $game,
        string $alias,
    ): array {
        $parameters = [
            'start' => $this->instant($start),
            'end' => $this->instant($end),
            'nothing' => RewardType::Nothing->value,
        ];

        if (null !== $game) {
            $sql .= sprintf(' AND %s.game_id = :game', $alias);
            $parameters['game'] = $game->getId();
        }

        // `:nothing` is in the collected query's parameters and not in its
        // SQL, which DBAL refuses. Dropped rather than made conditional at
        // every call site.
        if (!str_contains($sql, ':nothing')) {
            unset($parameters['nothing']);
        }

        /** @var array<string, mixed> $row */
        $row = $this->connection->fetchAssociative($sql, $parameters) ?: [];

        return array_map(static fn (mixed $value): int => (int) $value, $row);
    }

    /** UTC, because that is how the column stores them. */
    private function instant(\DateTimeImmutable $moment): string
    {
        return $moment->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }
}
