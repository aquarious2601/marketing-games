<?php

declare(strict_types=1);

namespace App\Wheel;

use App\Entity\Wheel;

/**
 * Shapes a wheel for the API (F01 section 8).
 *
 * Colour is added here rather than stored (F01 R14), and the total is sent so
 * that a client never has to add the probabilities up to know whether what it
 * holds is valid.
 */
final class WheelPresenter
{
    public function __construct(
        private readonly SlicePalette $palette,
    ) {
    }

    /**
     * @return array{
     *     id: int|null,
     *     updatedAt: string,
     *     totalProbability: int,
     *     prizes: list<array{id: int|null, name: string, probability: int, position: int, colour: string}>
     * }
     */
    public function present(Wheel $wheel): array
    {
        $prizes = [];

        foreach ($wheel->getPrizes() as $prize) {
            $prizes[] = [
                'id' => $prize->getId(),
                'name' => $prize->getName(),
                'probability' => $prize->getProbability(),
                'position' => $prize->getPosition(),
                'colour' => $this->palette->colourFor($prize->getPosition()),
            ];
        }

        // The collection is ordered by position in the mapping, but a wheel
        // modified in this request may not have been reloaded, so sort again
        // rather than trust the in-memory order.
        usort($prizes, static fn (array $a, array $b): int => $a['position'] <=> $b['position']);

        return [
            'id' => $wheel->getId(),
            'updatedAt' => $wheel->getUpdatedAt()->format(\DateTimeInterface::ATOM),
            'totalProbability' => $wheel->getTotalProbability(),
            'prizes' => $prizes,
        ];
    }
}
