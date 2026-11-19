<?php

declare(strict_types=1);

namespace App\Store;

use App\Entity\Store;
use App\Repository\StoreRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Hands out the one store, creating an empty, plain one the first time
 * (F04 R1 as F27 R1 restates it: the record that was the campaign's
 * branding is the shop itself).
 */
final class StoreProvider
{
    public function __construct(
        private readonly StoreRepository $repository,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    public function getOrCreate(): Store
    {
        $store = $this->repository->findTheStore();

        if ($store instanceof Store) {
            return $store;
        }

        $store = new Store();

        $this->entityManager->persist($store);
        $this->entityManager->flush();

        return $store;
    }
}
