<?php

declare(strict_types=1);

namespace App\Reward;

use App\Code\Alphabet;

/**
 * The code a player shows at the counter (F13 R17, R18).
 *
 * Read aloud across a counter and typed back in by somebody who is not
 * looking at it carefully, so the alphabet leaves out every character that
 * gets confused for another: no `O` against `0`, no `I` or `L` against `1`.
 * What is left is 32 characters, which is also why the grouping is 4+4 —
 * eight characters is 32^8, about a thousand billion codes, and a hyphen in
 * the middle is the difference between a code somebody can read back and a
 * smear of letters.
 *
 * Uppercase only, and input is upper-cased before comparison, because a
 * player reading their own screen will not match the case they were given.
 */
final class CodeGenerator
{
    /**
     * Crockford's alphabet without U (which turns up in words nobody wants
     * printed on a voucher).
     *
     * Moved to `App\Code\Alphabet` by F34, which needed the same characters
     * for a customer's card and should not have copied them: one answer to
     * "which characters are safe", read by both generators.
     */
    private const ALPHABET = Alphabet::CHARACTERS;

    private const GROUP = 4;
    private const GROUPS = 2;

    public function generate(): string
    {
        $groups = [];

        for ($group = 0; $group < self::GROUPS; ++$group) {
            $letters = '';

            for ($index = 0; $index < self::GROUP; ++$index) {
                $letters .= Alphabet::character();
            }

            $groups[] = $letters;
        }

        return implode('-', $groups);
    }

    /**
     * What somebody typed at a counter, as the start of a code — or null if
     * it cannot be the start of one (F16 R8, R12).
     *
     * The code is read off a screen and typed back in by somebody in a
     * hurry, so case, spaces and the hyphen are all noise. The hyphen in
     * particular is put back where it *must* go rather than taken from
     * where it was typed, which is why `a7k3m9px` and `A7K3-M9PX` end up
     * the same string.
     *
     * Null rather than an empty string, because the caller's question is
     * "should I compare this against codes at all" and a phone number
     * answers no. That keeps a numeric filter from being asked of the code
     * column as well.
     */
    public static function normalise(string $input): ?string
    {
        $letters = str_replace([' ', '-'], '', strtoupper(trim($input)));
        $length = \strlen($letters);

        if (0 === $length || $length > self::GROUP * self::GROUPS) {
            return null;
        }

        // strspn counts the leading characters that are in the alphabet, so
        // a short count is a character no code can contain — an O for a
        // zero, or an accent from somebody's keyboard.
        if ($length !== strspn($letters, self::ALPHABET)) {
            return null;
        }

        if ($length <= self::GROUP) {
            return $letters;
        }

        return substr($letters, 0, self::GROUP).'-'.substr($letters, self::GROUP);
    }

    /** What a code looks like, for anything that has to recognise one. */
    public static function pattern(): string
    {
        return sprintf(
            '/^[%s]{%d}(-[%s]{%d}){%d}$/',
            self::ALPHABET,
            self::GROUP,
            self::ALPHABET,
            self::GROUP,
            self::GROUPS - 1,
        );
    }
}
