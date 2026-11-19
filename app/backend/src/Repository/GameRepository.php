<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Game;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Game>
 */
final class GameRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Game::class);
    }

    /** @return list<Game> Oldest first, so the list does not reshuffle itself. */
    public function allOfTheStore(): array
    {
        return $this->createQueryBuilder('g')
            ->orderBy('g.id', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * F27 R20. Returns a game whatever its state: whether it is live is the
     * caller's decision to act on, because an ended game and an unknown key
     * have to end up on the same page (R25) and only the caller knows it.
     */
    public function findByKey(string $key): ?Game
    {
        return $this->findOneBy(['linkKey' => $key]);
    }

    /** @return list<Game> */
    public function live(): array
    {
        return $this->createQueryBuilder('g')
            ->andWhere('g.isLive = true')
            ->orderBy('g.id', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * F27 R26: `/` serves the player page only while exactly one game is
     * live, which is what the upgrade leaves, so every existing link and
     * bookmark keeps working. Two live games make `/` ambiguous and it says
     * so rather than picking one.
     */
    public function theOnlyLiveOne(): ?Game
    {
        $live = $this->live();

        return 1 === \count($live) ? $live[0] : null;
    }
}
