<?php

declare(strict_types=1);

namespace App\Branding;

use App\Entity\Branding;
use App\Repository\BrandingRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Hands out the one branding record, creating an empty, plain one the first
 * time (F04 R1, R8).
 */
final class BrandingProvider
{
    public function __construct(
        private readonly BrandingRepository $repository,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    public function getOrCreate(): Branding
    {
        $branding = $this->repository->findTheBranding();

        if ($branding instanceof Branding) {
            return $branding;
        }

        $branding = new Branding();

        $this->entityManager->persist($branding);
        $this->entityManager->flush();

        return $branding;
    }
}
