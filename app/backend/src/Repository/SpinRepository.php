<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Game;
use App\Entity\Player;
use App\Entity\Spin;
use App\Reward\ClaimState;
use App\Reward\CodeGenerator;
use App\Reward\RewardType;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\ORM\QueryBuilder;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Spin>
 */
final class SpinRepository extends ServiceEntityRepository
{
    /**
     * F08 R22. One player's history on one admin screen; a player who has
     * spun more times than this at a stall is a story the spin-log feature
     * can tell properly.
     */
    public const HISTORY_LIMIT = 200;

    /**
     * F09 R16. The whole log, capped.
     *
     * The cap exists so one runaway afternoon cannot make the page
     * unloadable; what matters more is that the caller is also told the true
     * total, so a capped list can say what it is showing instead of
     * pretending to be everything (F09 R21).
     */
    public const LOG_LIMIT = 200;

    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Spin::class);
    }

    /**
     * One player's spins, most recent first (F08 R22).
     *
     * Ordered by id as well as by time, because several spins by the same
     * person land in the same second often enough — a player pressing "Spin
     * again" — and a timestamp alone leaves their order to the database.
     *
     * @return list<Spin>
     */
    public function findForPlayer(Player $player): array
    {
        /** @var list<Spin> $spins */
        $spins = $this->createQueryBuilder('s')
            ->where('s.player = :player')
            ->setParameter('player', $player)
            ->orderBy('s.spunAt', 'DESC')
            ->addOrderBy('s.id', 'DESC')
            ->setMaxResults(self::HISTORY_LIMIT)
            ->getQuery()
            ->getResult();

        return $spins;
    }

    /**
     * One customer's wins, most recent first (F31 R11).
     *
     * Wins rather than spins: a losing spin has nothing to hand over, and
     * the counter is not the place to read about the ones that lost (R13).
     * The count of those is a number on the page, not a list.
     *
     * The game and the claiming account are join-fetched because every card
     * shows both (R12), and a customer who played all week would otherwise
     * cost two queries per win.
     *
     * @return list<Spin>
     */
    public function findWinsForPlayer(Player $player): array
    {
        /** @var list<Spin> $spins */
        $spins = $this->createQueryBuilder('s')
            ->addSelect('g')
            ->join('s.game', 'g')
            ->leftJoin('s.claimedBy', 'u')
            ->addSelect('u')
            ->where('s.player = :player')
            ->andWhere('s.rewardType <> :nothing')
            ->setParameter('player', $player)
            ->setParameter('nothing', RewardType::Nothing->value)
            ->orderBy('s.spunAt', 'DESC')
            ->addOrderBy('s.id', 'DESC')
            ->setMaxResults(self::HISTORY_LIMIT)
            ->getQuery()
            ->getResult();

        return $spins;
    }

    /**
     * How many spins this player has made since a given instant (F23 R3).
     *
     * A count rather than a list: the caller wants a number, and a stall
     * that has been busy all day should not load a hundred entities to
     * reach it. `spun_at` is indexed, and the player column is the other
     * half of the condition, so this is the cheap query it looks like.
     *
     * `>=` and no upper bound: the window is "since the day began", and
     * there is no such thing as a spin recorded in the future.
     */
    /**
     * How many sheets this person has been given on this game since an
     * instant (F28 R17).
     *
     * Sheets, not rows: a limit of 1 on a sheet of three gifts means one
     * sheet, and counting rows would refuse the second gift of the first
     * one. The distinct count is why a sheet carries an identity at all
     * (R19).
     */
    public function countSheetsForPlayerOnGameSince(
        Player $player,
        Game $game,
        \DateTimeImmutable $since,
    ): int {
        return (int) $this->createQueryBuilder('s')
            ->select('COUNT(DISTINCT s.sheetId)')
            ->where('s.player = :player')
            ->andWhere('s.game = :game')
            ->andWhere('s.spunAt >= :since')
            ->andWhere('s.sheetId IS NOT NULL')
            ->setParameter('player', $player)
            ->setParameter('game', $game)
            ->setParameter('since', $since)
            ->getQuery()
            ->getSingleScalarResult();
    }

    /**
     * The rows of this person's most recent sheet on this game, or none.
     *
     * F28 R18 keeps these off the refusal screen, but the page that has just
     * been given a sheet reloads, and this is what it reads back.
     *
     * @return list<Spin>
     */
    public function latestSheetFor(Player $player, Game $game): array
    {
        $sheet = $this->createQueryBuilder('s')
            ->select('s.sheetId')
            ->where('s.player = :player')
            ->andWhere('s.game = :game')
            ->andWhere('s.sheetId IS NOT NULL')
            ->setParameter('player', $player)
            ->setParameter('game', $game)
            ->orderBy('s.id', 'DESC')
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();

        if (null === $sheet) {
            return [];
        }

        /** @var list<Spin> $rows */
        $rows = $this->createQueryBuilder('s')
            ->where('s.sheetId = :sheet')
            ->setParameter('sheet', $sheet['sheetId'])
            ->orderBy('s.id', 'ASC')
            ->getQuery()
            ->getResult();

        return $rows;
    }

    /** F27 R38. The number in the Games list. */
    public function countForGame(Game $game): int
    {
        return (int) $this->createQueryBuilder('s')
            ->select('COUNT(s.id)')
            ->where('s.game = :game')
            ->setParameter('game', $game)
            ->getQuery()
            ->getSingleScalarResult();
    }

    public function countForPlayerOnGameSince(
        Player $player,
        Game $game,
        \DateTimeImmutable $since,
    ): int {
        return (int) $this->createQueryBuilder('s')
            ->select('COUNT(s.id)')
            ->where('s.player = :player')
            ->andWhere('s.game = :game')
            ->andWhere('s.spunAt >= :since')
            ->setParameter('player', $player)
            ->setParameter('game', $game)
            ->setParameter('since', $since)
            ->getQuery()
            ->getSingleScalarResult();
    }

    /**
     * Every spin, newest first, whoever made it (F09 R13).
     *
     * The player is join-fetched rather than lazily loaded: the log shows a
     * name and a number on every row, and without this a 200-row page is 200
     * extra queries.
     *
     * A LEFT JOIN, because a spin with no player is still a prize that left
     * the shop and must appear (F09 R15) — one written before F08, or one
     * whose player exercised their right to be deleted.
     *
     * @return list<Spin>
     */
    public function listRecent(
        ?string $filter = null,
        ?Game $game = null,
        ClaimState $state = ClaimState::All,
        int $limit = self::LOG_LIMIT,
    ): array {
        $builder = $this->createQueryBuilder('s')
            ->addSelect('p')
            ->leftJoin('s.player', 'p')
            // F31 R12: the account that claimed it is on the row now.
            ->addSelect('u')
            ->leftJoin('s.claimedBy', 'u')
            // F27 R44: join-fetched, because the log shows the game on every
            // row and without this a 200-row page is 200 extra queries.
            ->addSelect('g')
            ->join('s.game', 'g')
            ->orderBy('s.spunAt', 'DESC')
            // Pressing "Spin again" lands several spins in the same second,
            // so the id breaks the tie rather than leaving the order to the
            // database.
            ->addOrderBy('s.id', 'DESC')
            ->setMaxResults($limit);

        $this->applyFilter($builder, $filter);
        $this->applyGame($builder, $game);
        $this->applyWonSomething($builder);
        $this->applyState($builder, $state);

        /** @var list<Spin> $spins */
        $spins = $builder->getQuery()->getResult();

        return $spins;
    }

    /**
     * How many spins match, which is not how many were returned (F09 R21).
     */
    public function countMatching(
        ?string $filter = null,
        ?Game $game = null,
        ClaimState $state = ClaimState::All,
    ): int {
        $builder = $this->createQueryBuilder('s')
            ->select('COUNT(s.id)')
            ->leftJoin('s.player', 'p');

        $this->applyFilter($builder, $filter);
        $this->applyGame($builder, $game);
        $this->applyWonSomething($builder);
        $this->applyState($builder, $state);

        return (int) $builder->getQuery()->getSingleScalarResult();
    }

    /**
     * How many of the matching spins won nothing (F31 R24).
     *
     * The list leaves them out; this is the sentence that admits it. The
     * same filter and the same game, deliberately — a count taken over a
     * wider set than the list would be a different question answered in the
     * same breath.
     */
    public function countThatWonNothing(?string $filter = null, ?Game $game = null): int
    {
        $builder = $this->createQueryBuilder('s')
            ->select('COUNT(s.id)')
            ->leftJoin('s.player', 'p')
            ->andWhere('s.rewardType = :nothing')
            ->setParameter('nothing', RewardType::Nothing->value);

        $this->applyFilter($builder, $filter);
        $this->applyGame($builder, $game);

        return (int) $builder->getQuery()->getSingleScalarResult();
    }

    /**
     * F31 R23. The log is what left the shop, not what was drawn.
     *
     * This is the one rule in here that hides rows, and it hides the only
     * rows that cannot be acted on: a losing spin has no code, nothing to
     * hand over, and no control on it (F13 R15, R24). Its reason for being
     * on screen was completeness, which F31 moves to a count beside the
     * list and to the stats.
     */
    private function applyWonSomething(QueryBuilder $builder): void
    {
        $builder
            ->andWhere('s.rewardType <> :wonSomething')
            ->setParameter('wonSomething', RewardType::Nothing->value);
    }

    /**
     * Whether a code names a win that belongs to nobody (F31 R7).
     *
     * Asked only when a search for a customer came back empty, and only to
     * tell a true nothing from a prize whose owner the database cannot
     * name: a spin from before F08, or one whose customer exercised their
     * right to be deleted (F08 R19). The shop still owes somebody that
     * prize, so the counter is sent to the one screen that can hand it over
     * (F09 R15).
     */
    public function hasWinWithoutCustomer(?string $filter): bool
    {
        $code = null === $filter ? null : CodeGenerator::normalise($filter);

        if (null === $code) {
            return false;
        }

        $found = (int) $this->createQueryBuilder('s')
            ->select('COUNT(s.id)')
            ->where('s.player IS NULL')
            ->andWhere('s.rewardCode LIKE :code')
            ->setParameter('code', $code.'%')
            ->getQuery()
            ->getSingleScalarResult();

        return $found > 0;
    }

    /** F31 R25. Everything, what is still owed, or what has been given. */
    private function applyState(QueryBuilder $builder, ClaimState $state): void
    {
        match ($state) {
            ClaimState::All => null,
            ClaimState::Open => $builder->andWhere('s.claimedAt IS NULL'),
            ClaimState::Claimed => $builder->andWhere('s.claimedAt IS NOT NULL'),
        };
    }

    /**
     * F27 R44. One game, or every game.
     *
     * Null is deliberately "all of them" rather than "the live one": the
     * log is a record of what went out, and a promotion being over is no
     * reason to hide what it gave away.
     */
    private function applyGame(QueryBuilder $builder, ?Game $game): void
    {
        if (null === $game) {
            return;
        }

        $builder->andWhere('s.game = :game')->setParameter('game', $game);
    }

    /**
     * One box, two kinds of answer (F16 R7, R11).
     *
     * A phone number matches any part of the stored number (F09 R18,
     * matching F08 R21), which necessarily excludes the anonymous spins —
     * they have no number to match — and that is the one case where F09
     * R15's "always list them" does not apply, because the admin has asked
     * a question those rows cannot answer. Filtering by code excludes the
     * losing spins for exactly the same reason (F16 R15).
     *
     * The two conditions are OR-ed rather than chosen between by guessing
     * at what was typed. A guess would have to be wrong somewhere, and the
     * cost of asking both is one extra row when a short numeric filter
     * happens to start a code.
     */
    private function applyFilter(QueryBuilder $builder, ?string $filter): void
    {
        if (null === $filter || '' === $filter) {
            return;
        }

        // Escaped so a stray `%` typed into the filter matches a literal
        // percent rather than every spin in the database.
        $conditions = ['p.phone LIKE :phone'];
        $builder->setParameter('phone', '%'.addcslashes($filter, '%_\\').'%');

        // F16 R12: null here means the input cannot be the start of a code,
        // so the code column is not asked about at all. Nothing to escape —
        // the normaliser returns characters from the alphabet and a hyphen,
        // and neither `%` nor `_` is among them.
        $code = CodeGenerator::normalise($filter);

        if (null !== $code) {
            $conditions[] = 's.rewardCode LIKE :code';
            $builder->setParameter('code', $code.'%');
        }

        $builder->andWhere($builder->expr()->orX(...$conditions));
    }
}
