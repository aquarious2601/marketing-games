<?php

declare(strict_types=1);

namespace App\Player;

use App\Dto\PlayerDraft;
use App\Entity\Player;
use App\Repository\PlayerRepository;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Creates a player, or finds the one that already exists (F08 R6, R7).
 *
 * The lookup-then-insert here is racy by nature: two devices at the same
 * stall can submit the same number within the same second, and the window
 * between "not found" and "inserted" is exactly where the second one lands.
 * Rather than lock the table, the unique constraint is allowed to be the
 * arbiter and the loser reads the winner's row — so the second player is
 * identified instead of being shown an error about a number that is
 * demonstrably theirs.
 *
 * The existing row is never updated from the new submission. Somebody
 * retyping their number should not be able to rename the player who already
 * holds it (F08 R7) — and since F19 that includes retyping it in another
 * spelling, which is now the same row rather than a new one (F19 R10).
 *
 * One hole is left open, and F19 section 13 says why it is tolerable: the
 * unique constraint is on `phone`, so the race above is settled only when
 * both devices sent the same spelling. Two *different* spellings of one
 * number, submitted in the same instant, both insert — and P02's merge step
 * is what repairs that, rather than a lock held across every registration at
 * the stall.
 */
final class PlayerRegistrar
{
    public function __construct(
        private readonly PlayerRepository $players,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    public function register(PlayerDraft $draft): Registered
    {
        $existing = $this->players->findForNumber($draft->phone);

        if (null !== $existing) {
            return new Registered($existing, created: false);
        }

        $player = new Player($draft->phone, $draft->firstName, $draft->lastName, $draft->birthday);

        try {
            $this->entityManager->persist($player);
            $this->entityManager->flush();
        } catch (UniqueConstraintViolationException) {
            // Somebody else inserted this number between the check and the
            // flush. A failed flush closes the entity manager, so the row has
            // to be re-read on a fresh one rather than through $this->players.
            $this->entityManager->getConnection()->close();

            $won = $this->players->findForNumber($draft->phone);

            // Only a unique violation on this exact number can land here, so
            // the row must exist. If it somehow does not, something other
            // than the race is wrong and should not be swallowed.
            if (null === $won) {
                throw new \RuntimeException(sprintf('The phone number %s collided but cannot be found.', $draft->phone));
            }

            // F34 R9: the other device created them, this one did not, so
            // this one does not hand out their card.
            return new Registered($won, created: false);
        }

        return new Registered($player, created: true);
    }
}
