<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Player;
use App\Entity\Spin;
use App\Player\PhoneMatch;
use App\Reward\CodeGenerator;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\ORM\QueryBuilder;
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

    /**
     * The player who owns this number, however either of them spelled it
     * (F19 R9).
     *
     * Two steps, because one SQL comparison cannot answer it: the indexed
     * tail narrows the table to the rows that could match, and PhoneMatch
     * decides which of them does. The row holds `0614856240` and this finds
     * it from `+33614856240`.
     *
     * Named for the question rather than for the column, so a caller cannot
     * read it as an exact match on what was typed.
     */
    public function findForNumber(string $phone): ?Player
    {
        $candidates = $this->findBy(['phoneTail' => PhoneMatch::tail($phone)]);

        foreach ($candidates as $candidate) {
            if (PhoneMatch::same($phone, $candidate->getPhone())) {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * The admin list, newest first, with each customer's spin count
     * (F08 R20), matched on a number or a code (F31 R1).
     *
     * The count is a LEFT JOIN rather than a query per row: the list is the
     * one page that shows every player at once, and a count per row is how a
     * 200-player stall turns into 201 queries.
     *
     * @return list<array{player: Player, spinCount: int}>
     */
    public function listWithSpinCounts(?string $filter = null): array
    {
        $builder = $this->createQueryBuilder('p')
            ->select('p AS player', 'COUNT(s.id) AS spinCount')
            ->leftJoin(Spin::class, 's', 'WITH', 's.player = p')
            ->groupBy('p.id')
            ->orderBy('p.createdAt', 'DESC')
            ->addOrderBy('p.id', 'DESC')
            ->setMaxResults(self::LIST_LIMIT);

        $this->applySearch($builder, $filter);

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
    public function countMatching(?string $filter = null): int
    {
        $builder = $this->createQueryBuilder('p')->select('COUNT(p.id)');

        $this->applySearch($builder, $filter);

        return (int) $builder->getQuery()->getSingleScalarResult();
    }

    /**
     * One box, a number or a code (F31 R1, R5).
     *
     * The two conditions are OR-ed rather than chosen between, for the
     * reason F16 R7 gives about the log's own filter: staff type what the
     * customer handed them, and a server that guesses which of the two it
     * is has to be wrong somewhere.
     *
     * The code half is an EXISTS rather than a condition on the join in
     * listWithSpinCounts, which would be shorter and wrong: that join is
     * what counts a customer's spins, so narrowing it to one code would
     * make everybody found by a code look like they had played once.
     */
    private function applySearch(QueryBuilder $builder, ?string $filter): void
    {
        if (null === $filter || '' === $filter) {
            return;
        }

        // F08 R21: any part of the stored number — the last four digits off
        // a receipt. Escaped, so a filter of `%` finds a literal percent
        // rather than every customer in the database.
        $conditions = ['p.phone LIKE :phone'];
        $builder->setParameter('phone', '%'.addcslashes($filter, '%_\\').'%');

        // F16 R12, as F31 R4 keeps it: null means the input cannot be the
        // start of a code, so the codes are not asked about at all. A phone
        // number is exactly that kind of input.
        $code = CodeGenerator::normalise($filter);

        if (null !== $code) {
            $conditions[] = 'EXISTS ('
                .'SELECT w.id FROM '.Spin::class.' w '
                .'WHERE w.player = p AND w.rewardCode LIKE :code'
                .')';
            $builder->setParameter('code', $code.'%');
        }

        $builder->andWhere($builder->expr()->orX(...$conditions));
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
