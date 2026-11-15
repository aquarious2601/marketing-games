<?php

declare(strict_types=1);

namespace App\Reward;

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
     */
    private const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

    private const GROUP = 4;
    private const GROUPS = 2;

    public function generate(): string
    {
        $groups = [];

        for ($group = 0; $group < self::GROUPS; ++$group) {
            $letters = '';

            for ($index = 0; $index < self::GROUP; ++$index) {
                // random_int, not rand: a guessable voucher code is a
                // voucher anybody can have.
                $letters .= self::ALPHABET[random_int(0, \strlen(self::ALPHABET) - 1)];
            }

            $groups[] = $letters;
        }

        return implode('-', $groups);
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
