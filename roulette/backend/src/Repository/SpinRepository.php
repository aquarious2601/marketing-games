<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Player;
use App\Entity\Spin;
use App\Reward\CodeGenerator;
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
    public function listRecent(?string $filter = null, int $limit = self::LOG_LIMIT): array
    {
        $builder = $this->createQueryBuilder('s')
            ->addSelect('p')
            ->leftJoin('s.player', 'p')
            ->orderBy('s.spunAt', 'DESC')
            // Pressing "Spin again" lands several spins in the same second,
            // so the id breaks the tie rather than leaving the order to the
            // database.
            ->addOrderBy('s.id', 'DESC')
            ->setMaxResults($limit);

        $this->applyFilter($builder, $filter);

        /** @var list<Spin> $spins */
        $spins = $builder->getQuery()->getResult();

        return $spins;
    }

    /**
     * How many spins match, which is not how many were returned (F09 R21).
     */
    public function countMatching(?string $filter = null): int
    {
        $builder = $this->createQueryBuilder('s')
            ->select('COUNT(s.id)')
            ->leftJoin('s.player', 'p');

        $this->applyFilter($builder, $filter);

        return (int) $builder->getQuery()->getSingleScalarResult();
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
