<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Branding;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Branding>
 */
final class BrandingRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Branding::class);
    }

    /** There is only ever one (F04 R1). */
    public function findTheBranding(): ?Branding
    {
        return $this->createQueryBuilder('b')
            ->orderBy('b.id', 'ASC')
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }
}
