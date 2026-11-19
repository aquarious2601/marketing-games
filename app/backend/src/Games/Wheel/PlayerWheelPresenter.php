<?php

declare(strict_types=1);

namespace App\Games\Wheel;

use App\Games\Wheel\Entity\Prize;
use App\Games\Wheel\Entity\Wheel;

/**
 * Shapes the wheel for a player (F02 R1, R2).
 *
 * Separate from WheelPresenter for one reason: this one must never emit a
 * probability. Filtering the admin shape down would make it one forgotten
 * field away from leaking the odds, so the player's shape is built from
 * scratch and tested for the absence.
 */
final class PlayerWheelPresenter
{
    public function __construct(
        private readonly SlicePalette $palette,
    ) {
    }

    /**
     * @return array{prizes: list<array{id: int|null, name: string, position: int, colour: string}>}
     */
    public function present(Wheel $wheel): array
    {
        $prizes = [];

        foreach ($wheel->getPrizes() as $prize) {
            $prizes[] = $this->presentPrize($prize);
        }

        usort($prizes, static fn (array $a, array $b): int => $a['position'] <=> $b['position']);

        return ['prizes' => $prizes];
    }

    /**
     * @return array{id: int|null, name: string, position: int, colour: string}
     */
    public function presentPrize(Prize $prize): array
    {
        return [
            'id' => $prize->getId(),
            // F26 R11: the shape is unchanged, the source is not — this is
            // the reward's name now, so the player page needs no change.
            'name' => $prize->getLabel(),
            'position' => $prize->getPosition(),
            'colour' => $this->palette->colourFor($prize->getPosition()),
        ];
    }
}
