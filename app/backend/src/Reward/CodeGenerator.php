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

    /**
     * Ten digits, in three groups (F39 R2).
     *
     * Four and then two threes rather than five and five: a group of five
     * digits is one more than a reader holds in their head at a glance, and
     * the shape 4-3-3 is the one a telephone number taught everybody.
     *
     * Ten digits is one in ten billion. Fewer than the thirty-character
     * alphabet this replaced held in eight, and still far more than a shop
     * will issue — see F39 §13 for why that trade is the right way round.
     */
    private const GROUPS = [4, 3, 3];

    private const LENGTH = 10;

    public function generate(): string
    {
        return Alphabet::grouped(self::GROUPS);
    }

    /**
     * What somebody typed at a counter, as the start of a code — or null if
     * it cannot be the start of one (F16 R8, R12).
     *
     * The code is read off a screen and typed back in by somebody in a
     * hurry, so the spaces are noise. They are put back where they *must*
     * go rather than taken from where they were typed, which is why
     * `4821739506` and `4821 739 506` end up the same string.
     *
     * Null rather than an empty string, because the caller's question is
     * "should I compare this against codes at all", and something that
     * cannot be a code answers no.
     */
    public static function normalise(string $input): ?string
    {
        $digits = str_replace([' ', '-'], '', trim($input));
        $length = \strlen($digits);

        if (0 === $length || $length > self::LENGTH) {
            return null;
        }

        // strspn counts the leading characters that are in the alphabet, so
        // a short count is a character no code can contain — a letter, or an
        // accent from somebody's keyboard.
        if ($length !== strspn($digits, self::ALPHABET)) {
            return null;
        }

        return Alphabet::group($digits, self::GROUPS);
    }

    /** What a code looks like, for anything that has to recognise one. */
    public static function pattern(): string
    {
        return sprintf(
            '/^[%s]{4} [%s]{3} [%s]{3}$/',
            self::ALPHABET,
            self::ALPHABET,
            self::ALPHABET,
        );
    }
}
