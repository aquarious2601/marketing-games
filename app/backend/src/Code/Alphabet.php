<?php

declare(strict_types=1);

namespace App\Code;

/**
 * The characters a code may contain (F13 R18, F34 R2, F39 R1).
 *
 * Digits, since F39. The reason is the scanner rather than the reader: Code
 * 128 has a mode that encodes two digits in one symbol, and it is open only
 * to data that is all digits. The same code as digits — even at the greater
 * length F39 chose — is a barcode about a third narrower, which is most of
 * the difference between a scanner that reads a phone screen first time and
 * one that has to be waved about until it does.
 *
 * What this gave up is worth naming. The thirty characters this held before
 * were chosen so that nothing could be confused when read aloud or typed
 * back: no `O` against `0`, no `I` or `L` against `1`. Digits cannot be
 * confused with each other at all, so that problem goes away rather than
 * getting worse — what goes away with it is the number of codes a given
 * length holds, which is why F39 R2 and R3 are longer than what they
 * replaced.
 *
 * One place rather than two: reward codes and customer cards are different
 * lengths and different things, but the question "which characters may a
 * code contain" has one answer for both.
 */
final class Alphabet
{
    public const CHARACTERS = '0123456789';

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
     * somebody else (F39 R5).
     */
    public static function character(): string
    {
        return self::CHARACTERS[random_int(0, \strlen(self::CHARACTERS) - 1)];
    }

    /**
     * `$total` characters, split into the given groups and joined with a
     * space (F39 R2, R3, R4).
     *
     * The grouping is for reading and nothing else: everything that compares
     * codes strips it first, so a code typed without the spaces, or with
     * hyphens instead, is the same code.
     *
     * @param list<int> $groups
     */
    public static function grouped(array $groups): string
    {
        $parts = [];

        foreach ($groups as $size) {
            $part = '';

            for ($index = 0; $index < $size; ++$index) {
                $part .= self::character();
            }

            $parts[] = $part;
        }

        return implode(' ', $parts);
    }

    /**
     * The same split, applied to characters that already exist.
     *
     * @param list<int> $groups
     */
    public static function group(string $characters, array $groups): string
    {
        $parts = [];
        $at = 0;

        foreach ($groups as $size) {
            if ($at >= \strlen($characters)) {
                break;
            }

            $parts[] = substr($characters, $at, $size);
            $at += $size;
        }

        return implode(' ', $parts);
    }
}
