<?php

declare(strict_types=1);

namespace App\Games\GiftSheet;

use App\Entity\Game;
use App\Entity\Player;
use App\Entity\Spin;
use App\Games\GiftSheet\Entity\Gift;
use App\Games\GiftSheet\Repository\GiftRepository;
use App\Reward\CodeGenerator;
use App\Reward\RewardCost;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Hands a player every reward on a sheet (F28 R10).
 *
 * There is no draw here and nothing to decide, which is still the server
 * deciding: the list is the game's and the player receives it whole. What
 * this class is actually for is R11 — all of it, or none of it. Three gifts
 * and two codes is a row at the counter, so the whole sheet goes out in one
 * transaction and a failure anywhere leaves nothing behind.
 */
final class SheetIssuer
{
    /** As F16's wheel codes: enough retries that a collision is a non-event. */
    private const CODE_ATTEMPTS = 5;

    public function __construct(
        private readonly GiftRepository $gifts,
        private readonly CodeGenerator $codes,
        private readonly EntityManagerInterface $entityManager,
        private readonly RewardCost $costs,
    ) {
    }

    /**
     * @return list<Spin> one row per gift, in the admin's order, sharing one
     *                    sheet identity (R12, R19)
     */
    public function issue(Game $game, Player $player): array
    {
        $gifts = $this->gifts->onSheet($game);

        if ([] === $gifts) {
            throw new \LogicException('A sheet with no gifts on it cannot be issued (F28 R7).');
        }

        return $this->entityManager->wrapInTransaction(function () use ($game, $player, $gifts): array {
            /*
             * R19. One value shared by the rows, so "how many sheets today"
             * is a count and "the same sheet again" is a lookup — rather
             * than a guess from timestamps, which would group two sheets
             * issued in the same second.
             */
            $sheet = $this->codes->generate();
            $issued = [];

            foreach ($gifts as $gift) {
                $issued[] = $this->give($gift, $game, $player, $sheet);
            }

            $this->entityManager->flush();

            return $issued;
        });
    }

    private function give(Gift $gift, Game $game, Player $player, string $sheet): Spin
    {
        $spin = Spin::forGift($gift, $player);
        $spin->setGame($game);
        $spin->setSheetId($sheet);

        // F32 R8, as on the wheel: the cost at the moment it went out.
        $spin->setRewardCost($this->costs->of($gift->getReward()));

        // F16 R1 as F28 R10 extends it: a code per gift, minted inside the
        // transaction that records it, so a code that exists is always a
        // code somebody was given.
        if ($spin->isClaimable()) {
            $this->issueCode($spin);
        }

        $this->entityManager->persist($spin);

        return $spin;
    }

    /**
     * F13 R16–R18. Retried against the unique index rather than checked
     * first: a SELECT before the INSERT would still race two sheets issued
     * at once, and the index is the only thing that cannot be raced.
     */
    private function issueCode(Spin $spin): void
    {
        for ($attempt = 1; $attempt <= self::CODE_ATTEMPTS; ++$attempt) {
            $spin->setRewardCode($this->codes->generate());

            try {
                $this->entityManager->flush();

                return;
            } catch (UniqueConstraintViolationException $clash) {
                if (self::CODE_ATTEMPTS === $attempt) {
                    throw $clash;
                }
            }
        }
    }
}
