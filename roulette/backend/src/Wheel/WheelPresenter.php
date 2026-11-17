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
     *     includesLosingSlice: bool,
     *     prizes: list<array{id: int|null, probability: int, position: int, colour: string, rewardId: int|null}>
     * }
     */
    public function present(Wheel $wheel): array
    {
        $prizes = [];

        foreach ($wheel->getPrizes() as $prize) {
            $prizes[] = [
                'id' => $prize->getId(),
                'probability' => $prize->getProbability(),
                'position' => $prize->getPosition(),
                'colour' => $this->palette->colourFor($prize->getPosition()),
                // F13 R7, F26 R12: what this slice gives away, and therefore
                // what it is called. No name travels with it — the page holds
                // the reward catalogue to fill its selector, so it reads the
                // label from there rather than from a second copy here that
                // the PUT would have to ignore.
                'rewardId' => $prize->getReward()?->getId(),
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
            'includesLosingSlice' => $wheel->includesLosingSlice(),
            'prizes' => $prizes,
        ];
    }
}
