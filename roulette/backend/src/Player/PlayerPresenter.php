<?php

declare(strict_types=1);

namespace App\Player;

use App\Entity\Player;
use App\Entity\Spin;

/**
 * What a player looks like over the wire.
 *
 * Two shapes on purpose, and the difference between them is the whole of
 * F08 R11: the browser is told a first name and a number, and the admin is
 * told everything. The last name and the birthday are collected, stored and
 * never sent back to a page a player can open.
 *
 * Keeping both shapes in one class means the player shape cannot quietly
 * grow a field: whoever adds one here has the admin shape directly beneath
 * it, and has to choose.
 */
final class PlayerPresenter
{
    /**
     * F08 R11. The first name greets them; the number lets the page show
     * which identity it is holding, which is what makes "Not you?" mean
     * something on a shared phone.
     *
     * @return array{firstName: string, phone: string}
     */
    public function presentForPlayer(Player $player): array
    {
        return [
            'firstName' => $player->getFirstName(),
            'phone' => $player->getPhone(),
        ];
    }

    /**
     * F08 R20.
     *
     * @return array{id: int|null, phone: string, firstName: string, lastName: string, birthday: string, createdAt: string, spinCount: int}
     */
    public function presentForAdmin(Player $player, int $spinCount): array
    {
        return [
            'id' => $player->getId(),
            'phone' => $player->getPhone(),
            'firstName' => $player->getFirstName(),
            'lastName' => $player->getLastName(),
            // A date, not an instant: sending a birthday as an ISO datetime
            // invites a timezone shift that moves it a day.
            'birthday' => $player->getBirthday()->format('Y-m-d'),
            'createdAt' => $player->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'spinCount' => $spinCount,
        ];
    }

    /**
     * F08 R22. The prize name comes from the spin's own snapshot (F02 R10),
     * so a history entry still says what was won after the prize was renamed
     * or deleted.
     *
     * @return array{id: int|null, prizeName: string, spunAt: string}
     */
    public function presentSpin(Spin $spin): array
    {
        return [
            'id' => $spin->getId(),
            'prizeName' => $spin->getPrizeName(),
            'spunAt' => $spin->getSpunAt()->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * A spin for the whole log, which has to say who made it (F09 R14).
     *
     * `player` is null for an anonymous spin and the key is still present
     * (F09 R15): a spin from before F08, or one whose player has been
     * deleted, is a prize that left the shop and belongs in the log. The page
     * reads one shape either way.
     *
     * @return array{id: int|null, prizeName: string, spunAt: string, player: array{id: int|null, phone: string, firstName: string, lastName: string}|null, rewardType: string, rewardValue: int|null, code: string|null, claimable: bool, claimedAt: string|null}
     */
    public function presentLoggedSpin(Spin $spin): array
    {
        $player = $spin->getPlayer();

        return [
            ...$this->presentSpin($spin),
            'player' => null === $player ? null : $this->presentBriefly($player),
            // F13 R25: the snapshot, so the log still says what was won
            // after the catalogue has moved on.
            'rewardType' => $spin->getRewardType()->value,
            'rewardValue' => $spin->getRewardValue(),
            'code' => $spin->getRewardCode(),
            'claimable' => $spin->isClaimable(),
            'claimedAt' => $spin->getClaimedAt()?->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * Enough of a player to identify them on a log row, and no more.
     *
     * Deliberately not `presentForAdmin`: the log is a list of prizes given
     * away, and a birthday on every row of it is personal data travelling
     * further than the screen needs (F08 R24).
     *
     * @return array{id: int|null, phone: string, firstName: string, lastName: string}
     */
    public function presentBriefly(Player $player): array
    {
        return [
            'id' => $player->getId(),
            'phone' => $player->getPhone(),
            'firstName' => $player->getFirstName(),
            'lastName' => $player->getLastName(),
        ];
    }
}
