<?php

declare(strict_types=1);

namespace App\Games\GiftSheet\Repository;

use App\Entity\Game;
use App\Games\GiftSheet\Entity\Gift;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Gift>
 */
final class GiftRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Gift::class);
    }

    /**
     * A game's gifts, in the admin's order (F28 R6).
     *
     * The reward is join-fetched because a gift's name *is* its reward's
     * name (R4), so every caller needs it and without this a sheet of six is
     * six extra queries.
     *
     * @return list<Gift>
     */
    public function onSheet(Game $game): array
    {
        /** @var list<Gift> $gifts */
        $gifts = $this->createQueryBuilder('g')
            ->addSelect('r')
            ->join('g.reward', 'r')
            ->andWhere('g.game = :game')
            ->setParameter('game', $game)
            ->orderBy('g.position', 'ASC')
            ->getQuery()
            ->getResult();

        return $gifts;
    }

    /** F28 R7: a sheet with nothing on it may not go live. */
    public function countOnSheet(Game $game): int
    {
        return (int) $this->createQueryBuilder('g')
            ->select('COUNT(g.id)')
            ->andWhere('g.game = :game')
            ->setParameter('game', $game)
            ->getQuery()
            ->getSingleScalarResult();
    }

    /**
     * Which games use a reward, so F13's catalogue can say what it is on
     * before somebody deletes it.
     *
     * @return list<string>
     */
    public function gamesUsing(int $rewardId): array
    {
        /** @var list<array{name: string}> $rows */
        $rows = $this->createQueryBuilder('g')
            ->select('game.name AS name')
            ->join('g.game', 'game')
            ->andWhere('g.reward = :reward')
            ->setParameter('reward', $rewardId)
            ->orderBy('game.id', 'ASC')
            ->getQuery()
            ->getResult();

        return array_column($rows, 'name');
    }
}
