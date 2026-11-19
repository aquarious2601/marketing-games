<?php

declare(strict_types=1);

namespace App\Games\GiftSheet;

use App\Entity\Spin;
use App\Games\GiftSheet\Entity\Gift;

/**
 * Shapes a sheet for the player's page (F28 §8).
 *
 * Two shapes, and the difference between them is the feature: before the
 * sheet is issued a player is told what is on it, with no codes; afterwards
 * they are told the same list with a code against each line. Nothing here
 * ever reports a probability, because a sheet has none (R10).
 */
final class SheetPresenter
{
    /**
     * What this game gives, by name and in the admin's order (R6).
     *
     * @param list<Gift> $gifts
     *
     * @return list<array{name: string, type: string, value: int|null}>
     */
    public function present(array $gifts): array
    {
        return array_map(
            static fn (Gift $gift): array => [
                'name' => $gift->getLabel(),
                'type' => $gift->getReward()->getType()->value,
                'value' => $gift->getReward()->getValue(),
            ],
            $gifts,
        );
    }

    /**
     * The same list once it has been given away, each line with its code.
     *
     * @param list<Spin> $issued
     *
     * @return array{sheetId: string, gifts: list<array{name: string, type: string, value: int|null, code: string|null}>}
     */
    public function presentIssued(array $issued): array
    {
        $first = $issued[0] ?? null;

        return [
            // R19. The page does not use it, but the admin's log groups by
            // it and a client that can see its own sheet's identity can ask
            // about it at a counter.
            'sheetId' => $first?->getSheetId() ?? '',
            'gifts' => array_map(
                static fn (Spin $spin): array => [
                    'name' => $spin->getPrizeName(),
                    'type' => $spin->getRewardType()->value,
                    'value' => $spin->getRewardValue(),
                    // F16 R2's rule holds per line: a reward with nothing to
                    // claim carries no code.
                    'code' => $spin->getRewardCode(),
                ],
                $issued,
            ),
        ];
    }
}
