<?php

declare(strict_types=1);

namespace App\Player;

use App\Entity\Player;

/**
 * The one place a phone number becomes a key (F08 R3).
 *
 * Deliberately loose: digits and a leading `+`, 6 to 20 of them, and no
 * country rules. See F08 section 13 for that decision and what it costs — the
 * short version is that a strict validator which rejects a legitimate foreign
 * number at a stall is worse than a loose one which accepts a typo.
 *
 * It exists as one static method, called from the parser and from nowhere
 * else, because the cost of being loose is paid the day someone wants to
 * re-canonicalise the table against a country setting. That is a one-off
 * script against one function, not an audit of every caller.
 */
final class PhoneNumber
{
    /**
     * The canonical form, or null when what was typed cannot be one.
     *
     * Unicode digits are not accepted as digits: a number pasted in Eastern
     * Arabic numerals would canonicalise to something no staff member could
     * read back off a screen, so only ASCII 0-9 counts.
     */
    public static function canonicalise(string $raw): ?string
    {
        // Normalised before trimming, because a number pasted out of a chat
        // app regularly arrives wrapped in non-breaking spaces, which neither
        // trim() nor a \s class removes.
        $candidate = trim(str_replace(["\u{00A0}", "\u{202F}", "\u{2007}"], ' ', $raw));

        // A `+` anywhere but the front is punctuation, not a country prefix.
        $international = str_starts_with($candidate, '+');

        $digits = preg_replace('/\D+/', '', $candidate) ?? '';
        $length = \strlen($digits);

        if ($length < Player::MIN_PHONE_DIGITS || $length > Player::MAX_PHONE_DIGITS) {
            return null;
        }

        return ($international ? '+' : '').$digits;
    }
}
