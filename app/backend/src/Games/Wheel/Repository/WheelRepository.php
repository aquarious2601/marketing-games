<?php

declare(strict_types=1);

namespace App\Games\Wheel\Repository;

use App\Entity\Game;
use App\Games\Wheel\Entity\Wheel;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Wheel>
 */
final class WheelRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Wheel::class);
    }

    /**
     * One wheel per game (F27 R6). What used to be "the" wheel is the wheel
     * of whichever game is being asked about.
     */
    public function findForGame(Game $game): ?Wheel
    {
        return $this->findOneBy(['game' => $game]);
    }
}
