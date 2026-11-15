<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Player;
use App\Entity\Spin;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Player>
 */
final class PlayerRepository extends ServiceEntityRepository
{
    /**
     * F08 R20. A stall does not produce thousands of players, and an admin
     * list that silently stops at an arbitrary number is worse than one that
     * says so — the cap is high enough to be the whole table in practice and
     * low enough that a runaway import cannot make the page unloadable.
     */
    public const LIST_LIMIT = 500;

    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Player::class);
    }

    /** Looks up by the canonical form only (F08 R3, R5). */
    public function findByPhone(string $phone): ?Player
    {
        return $this->findOneBy(['phone' => $phone]);
    }

    /**
     * The admin list, newest first, with each player's spin count (F08 R20).
     *
     * The count is a LEFT JOIN rather than a query per row: the list is the
     * one page that shows every player at once, and a count per row is how a
     * 200-player stall turns into 201 queries.
     *
     * @return list<array{player: Player, spinCount: int}>
     */
    public function listWithSpinCounts(?string $phoneFilter = null): array
    {
        $builder = $this->createQueryBuilder('p')
            ->select('p AS player', 'COUNT(s.id) AS spinCount')
            ->leftJoin(Spin::class, 's', 'WITH', 's.player = p')
            ->groupBy('p.id')
            ->orderBy('p.createdAt', 'DESC')
            ->addOrderBy('p.id', 'DESC')
            ->setMaxResults(self::LIST_LIMIT);

        if (null !== $phoneFilter && '' !== $phoneFilter) {
            // F08 R21: any part of the stored number. The admin at a counter
            // is reading the last four digits off a receipt, not retyping the
            // whole thing. LIKE escapes are applied so a filter of `%` finds
            // a literal percent rather than every player.
            $builder
                ->andWhere('p.phone LIKE :phone')
                ->setParameter('phone', '%'.addcslashes($phoneFilter, '%_\\').'%');
        }

        /** @var list<array{player: Player, spinCount: int|string}> $rows */
        $rows = $builder->getQuery()->getResult();

        return array_map(
            static fn (array $row): array => [
                'player' => $row['player'],
                // COUNT comes back as a string on some drivers.
                'spinCount' => (int) $row['spinCount'],
            ],
            $rows,
        );
    }

    /**
     * How many players match the filter (F09 R21).
     *
     * Separate from `listWithSpinCounts` because that one is capped. Counting
     * the rows it returned is what the admin list did until F09, which meant
     * a shop with 600 customers would have read "500 players" forever.
     */
    public function countMatching(?string $phoneFilter = null): int
    {
        $builder = $this->createQueryBuilder('p')->select('COUNT(p.id)');

        if (null !== $phoneFilter && '' !== $phoneFilter) {
            // Escaped, so a stray `%` in the filter is a literal percent.
            $builder
                ->andWhere('p.phone LIKE :phone')
                ->setParameter('phone', '%'.addcslashes($phoneFilter, '%_\\').'%');
        }

        return (int) $builder->getQuery()->getSingleScalarResult();
    }

    public function countSpins(Player $player): int
    {
        return (int) $this->getEntityManager()
            ->createQueryBuilder()
            ->select('COUNT(s.id)')
            ->from(Spin::class, 's')
            ->where('s.player = :player')
            ->setParameter('player', $player)
            ->getQuery()
            ->getSingleScalarResult();
    }
}
