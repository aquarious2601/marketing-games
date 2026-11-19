<?php

declare(strict_types=1);

namespace App\Games\Wheel;

use App\Games\Wheel\Entity\Prize;
use App\Games\Wheel\Entity\Wheel;

/**
 * Picks the winning prize (F02 R4–R8).
 *
 * This runs on the server and nowhere else. The browser is never given the
 * probabilities, let alone the choice: if it were, the grand prize could be
 * won on demand by anyone willing to open the developer tools.
 */
class PrizeDraw
{
    /**
     * @throws \LogicException when the wheel has nothing that can be won
     */
    public function draw(Wheel $wheel): Prize
    {
        $prizes = $wheel->getPrizes()->toArray();

        if ([] === $prizes) {
            throw new \LogicException('A wheel with no prizes cannot be spun.');
        }

        // F02 R7: bounded by what is actually stored rather than by an
        // assumed 100, so a wheel edited straight in the database still
        // produces a prize instead of falling off the end of the loop.
        $total = $wheel->getTotalProbability();

        if ($total < 1) {
            throw new \LogicException('A wheel whose probabilities total zero cannot be spun.');
        }

        $pick = $this->pick($total);
        $cumulative = 0;

        foreach ($prizes as $prize) {
            $cumulative += $prize->getProbability();

            if ($pick <= $cumulative) {
                return $prize;
            }
        }

        // Unreachable while the total is the sum of the parts, but a wheel is
        // worth more than a silent wrong answer if that ever stops being true.
        throw new \LogicException(sprintf('The draw fell through: picked %d of %d.', $pick, $total));
    }

    /**
     * F02 R6. `random_int` is cryptographically secure, so a player cannot
     * infer the next result from the ones they have already seen. Overridden
     * in tests to make the draw deterministic.
     */
    protected function pick(int $total): int
    {
        return random_int(1, $total);
    }
}
