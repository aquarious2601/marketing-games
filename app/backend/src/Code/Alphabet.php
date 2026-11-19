<?php

declare(strict_types=1);

namespace App\Code;

/**
 * The characters a code may contain (F13 R18, F34 R2).
 *
 * One place rather than two. Reward codes and customer cards are different
 * lengths and different things, but the reason for the alphabet is the same
 * for both: a code is read aloud across a counter and typed back in by
 * somebody who is not looking at it carefully, so every character that gets
 * confused for another is left out — no `O` against `0`, no `I` or `L`
 * against `1`, and no `U`, which turns up in words nobody wants printed on a
 * voucher.
 *
 * Thirty characters. If this ever changes, every code already issued keeps
 * working — nothing validates an old code against the current alphabet — but
 * the two generators would start producing codes of different vintages, so
 * it should not change without a reason worth that.
 */
final class Alphabet
{
    public const CHARACTERS = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

    /** The characters as a character class, for anything matching one. */
    public static function pattern(): string
    {
        return self::CHARACTERS;
    }

    /**
     * One character, chosen so it cannot be guessed.
     *
     * `random_int`, not `rand`: a guessable voucher code is a voucher
     * anybody can have, and a guessable customer card is a way to point at
     * somebody else.
     */
    public static function character(): string
    {
        return self::CHARACTERS[random_int(0, \strlen(self::CHARACTERS) - 1)];
    }
}
