<?php

declare(strict_types=1);

namespace App\Reward;

/**
 * Which wins the spin log is being asked for (F31 R25).
 *
 * An enum rather than a nullable bool because it travels as a query
 * parameter and has to be answered for by name: `status=open` says what it
 * means in a URL a shop may bookmark, where `claimed=0` would not.
 *
 * There is no state for "won nothing". Those spins left the log with F31
 * R23, and a filter that could ask for them would be a way back to the
 * screen this feature was built to replace.
 */
enum ClaimState: string
{
    case All = 'all';
    case Open = 'open';
    case Claimed = 'claimed';

    /**
     * What arrived in the query string, or `All`.
     *
     * Unknown input is the default rather than a `422`: a status is a view
     * of a list, and refusing to show a log because a bookmark holds a
     * misspelled filter helps nobody at a counter.
     */
    public static function fromRequest(?string $value): self
    {
        return self::tryFrom(strtolower(trim((string) $value))) ?? self::All;
    }
}
