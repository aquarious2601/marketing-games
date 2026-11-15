<?php

declare(strict_types=1);

namespace App\Wheel;

use App\Entity\Prize;
use App\Entity\Wheel;
use App\Repository\WheelRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Hands out the one wheel, creating a sensible default the first time
 * (F01 R2), so the admin page is never an empty form that cannot be saved.
 */
final class WheelProvider
{
    /**
     * Totals 100 (F01 R8), so the default configuration is immediately valid
     * and the admin can save after a single edit.
     *
     * @var list<array{string, int}>
     */
    private const DEFAULT_PRIZES = [
        ['Try again', 40],
        ['5% off your next order', 25],
        ['10% off your next order', 15],
        ['Free sample', 10],
        ['Free gift', 7],
        ['Grand prize', 3],
    ];

    public function __construct(
        private readonly WheelRepository $wheels,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    public function getOrCreate(): Wheel
    {
        $wheel = $this->wheels->findTheWheel();

        if ($wheel instanceof Wheel) {
            return $wheel;
        }

        $wheel = new Wheel();

        foreach (self::DEFAULT_PRIZES as $position => [$name, $probability]) {
            $wheel->addPrize(new Prize($name, $probability, $position));
        }

        $this->entityManager->persist($wheel);
        $this->entityManager->flush();

        return $wheel;
    }
}
