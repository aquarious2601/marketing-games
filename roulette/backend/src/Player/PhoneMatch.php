<?php

declare(strict_types=1);

namespace App\Player;

/**
 * What makes two spellings of a number the same person (F19 R2).
 *
 * The rule is a suffix: strip a leading `00`, or one leading trunk `0`, and
 * one number is the other if its digits end the other's. It needs no country
 * because a trunk `0`, a dialling code and a `00` are all *prefixes* — what
 * distinguishes one person's number from another's is at the end.
 *
 * So `0614856240` and `+33614856240` are one person, and `0614856240` and
 * `0714856240` — two French mobile prefixes, two different people — are not,
 * because numbers of the same length can never be a suffix of one another.
 * That second half is what a fixed-length key gets wrong: taking the last
 * nine digits of both merges them.
 *
 * F18 tried the other shape entirely — rewrite every number into
 * international form against a country chosen on the campaign — and is kept
 * in the history as a warning. It needed a setting before it worked at all,
 * it rewrote the numbers it was given, and on a language whose country has no
 * trunk prefix it read `0614856240` as `+10614856240`. See F19 section 2.
 */
final class PhoneMatch
{
    /**
     * F19 R4. How many digits of the end are stored beside the number, to
     * narrow a lookup to a handful of candidates.
     *
     * Six, which is below MIN_OVERLAP on purpose: two numbers that match
     * share at least eight digits of their end, so they certainly share six,
     * and no match can hide from this. It narrows; it never decides.
     */
    public const TAIL_LENGTH = 6;

    /**
     * F19 R3. How much two numbers must share before a suffix counts.
     *
     * Eight, because eight digits is the shortest national number in use
     * anywhere this is likely to run — Singapore, Hong Kong, Denmark — and
     * their national form has to match their international one. Below that,
     * only an exact match counts: F08 accepts a number as short as six
     * digits, and a six-digit number is the end of a great many longer ones.
     */
    public const MIN_OVERLAP = 8;

    /**
     * The digits a lookup narrows on — never the answer (F19 R4).
     */
    public static function tail(string $phone): string
    {
        $digits = self::digits($phone);

        return \strlen($digits) <= self::TAIL_LENGTH
            ? $digits
            : substr($digits, -self::TAIL_LENGTH);
    }

    /**
     * Whether these two numbers belong to one person (F19 R2, R3, R8).
     *
     * Symmetric, and true of a number and itself, so it can be used to group
     * a table as well as to answer a lookup.
     */
    public static function same(string $one, string $other): bool
    {
        $one = self::significant($one);
        $other = self::significant($other);

        if ($one === $other) {
            return true;
        }

        [$shorter, $longer] = \strlen($one) <= \strlen($other) ? [$one, $other] : [$other, $one];

        if (\strlen($shorter) < self::MIN_OVERLAP) {
            return false;
        }

        return str_ends_with($longer, $shorter);
    }

    /**
     * The digits that carry meaning: a leading `00` is a way of writing `+`
     * and a single leading `0` is a trunk prefix, so neither says anything
     * about which person this is.
     *
     * Only one `0` is removed. A country that keeps a zero in its
     * international form — an Italian landline is `+39 06 …` — keeps it in
     * both spellings, so removing one from each leaves them agreeing.
     */
    private static function significant(string $phone): string
    {
        $digits = self::digits($phone);

        if (str_starts_with($digits, '00')) {
            return substr($digits, 2);
        }

        if (str_starts_with($digits, '0')) {
            return substr($digits, 1);
        }

        return $digits;
    }

    /**
     * Only ASCII 0-9, so a `+`, a space, a dot and a bracket all fall away
     * and the comparison is of the number rather than of how it was written.
     */
    private static function digits(string $phone): string
    {
        return preg_replace('/\D+/', '', $phone) ?? '';
    }
}
