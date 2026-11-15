<?php

declare(strict_types=1);

namespace App\Wheel;

use App\Entity\Player;
use App\Entity\Spin;
use App\Entity\Wheel;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Draws a prize and records the play as one unit (F02 R12).
 *
 * Drawing and recording are deliberately inseparable. If the write failed
 * while the draw stood, the player would be told they had won something the
 * business has no record of ever giving away.
 */
final class SpinRecorder
{
    public function __construct(
        private readonly PrizeDraw $draw,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    /**
     * `$player` is required rather than optional (F08 R17). An anonymous spin
     * is no longer a thing the application can produce, and a default of null
     * here would let a future caller write one without noticing.
     */
    public function spin(Wheel $wheel, Player $player): Spin
    {
        return $this->entityManager->wrapInTransaction(function () use ($wheel, $player): Spin {
            $spin = new Spin($this->draw->draw($wheel), $player);

            $this->entityManager->persist($spin);
            $this->entityManager->flush();

            return $spin;
        });
    }
}
