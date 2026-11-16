<?php

declare(strict_types=1);

namespace App\Wheel;

use App\Entity\Player;
use App\Entity\Spin;
use App\Entity\Wheel;
use App\Reward\CodeGenerator;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
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
    /**
     * How many times a code collision is retried (F13 R17).
     *
     * With 30^8 codes a collision is vanishingly unlikely, so three is not
     * about the odds — it is about never looping forever if the generator
     * is broken. The unique index, not this, is what guarantees uniqueness.
     */
    private const CODE_ATTEMPTS = 3;

    public function __construct(
        private readonly PrizeDraw $draw,
        private readonly EntityManagerInterface $entityManager,
        private readonly CodeGenerator $codes,
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

            // F16 R1: issued inside the same transaction that records the
            // spin, so a code that exists is always a code somebody won.
            // Every win carries one now; R2 leaves the losing slice out,
            // which is the same fact as "nothing to claim".
            if ($spin->isClaimable()) {
                $this->issueCode($spin);
            }

            $this->entityManager->persist($spin);
            $this->entityManager->flush();

            return $spin;
        });
    }

    /**
     * F13 R16-R18.
     *
     * Retried against the unique index rather than checked first: a SELECT
     * before the INSERT would still race two simultaneous spins, and the
     * index is the only thing that cannot be raced.
     */
    private function issueCode(Spin $spin): void
    {
        for ($attempt = 1; $attempt <= self::CODE_ATTEMPTS; ++$attempt) {
            $spin->setRewardCode($this->codes->generate());

            try {
                $this->entityManager->persist($spin);
                $this->entityManager->flush();

                return;
            } catch (UniqueConstraintViolationException $collision) {
                if ($attempt === self::CODE_ATTEMPTS) {
                    throw $collision;
                }
            }
        }
    }
}
