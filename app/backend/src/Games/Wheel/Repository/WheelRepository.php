<?php

declare(strict_types=1);

namespace App\Games\Wheel\Repository;

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
     * There is only ever one wheel (F01 R2). Ordering by id keeps the choice
     * deterministic even if a stray second row were ever created.
     */
    public function findTheWheel(): ?Wheel
    {
        return $this->createQueryBuilder('w')
            ->orderBy('w.id', 'ASC')
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }
}
