<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Player;
use App\Entity\Spin;
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
    public function listRecent(?string $phoneFilter = null, int $limit = self::LOG_LIMIT): array
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

        $this->applyPhoneFilter($builder, $phoneFilter);

        /** @var list<Spin> $spins */
        $spins = $builder->getQuery()->getResult();

        return $spins;
    }

    /**
     * How many spins match, which is not how many were returned (F09 R21).
     */
    public function countMatching(?string $phoneFilter = null): int
    {
        $builder = $this->createQueryBuilder('s')
            ->select('COUNT(s.id)')
            ->leftJoin('s.player', 'p');

        $this->applyPhoneFilter($builder, $phoneFilter);

        return (int) $builder->getQuery()->getSingleScalarResult();
    }

    /**
     * F09 R18, matching F08 R21: any part of the stored number.
     *
     * Filtering by a number necessarily excludes the anonymous spins — they
     * have no number to match — which is the one case where R15's "always
     * list them" does not apply, because the admin has asked a question those
     * rows cannot answer.
     */
    private function applyPhoneFilter(QueryBuilder $builder, ?string $phoneFilter): void
    {
        if (null === $phoneFilter || '' === $phoneFilter) {
            return;
        }

        // Escaped so a stray `%` typed into the filter matches a literal
        // percent rather than every spin in the database.
        $builder
            ->andWhere('p.phone LIKE :phone')
            ->setParameter('phone', '%'.addcslashes($phoneFilter, '%_\\').'%');
    }
}
