<?php

declare(strict_types=1);

namespace App\Player;

use App\Code\Alphabet;

/**
 * The code a customer keeps (F34 R1, R2).
 *
 * Separate from `App\Reward\CodeGenerator`, which makes reward codes and
 * says so in its name. The two share an alphabet and nothing else: this one
 * is ten characters where a reward is eight, and the difference is not
 * decoration. It means a customer code and a reward code can never be the
 * same string, so the counter's one box can take either without having to
 * ask which it was given — and staff can see at a glance which they are
 * holding.
 *
 * Ten rather than twelve for a reason that is arithmetic rather than taste.
 * Code 128 spends eleven modules a character, so twelve characters would be
 * 187 modules with F33's quiet zones, and in the player's panel at 375px
 * that is 1.75px a module — under F33 R8's floor. Ten is 165 and about 2px.
 *
 * This is not a credential. It names a customer to staff who are already
 * signed in and grants nothing to whoever holds it (F34 R5); it is random
 * so that it says nothing about how many customers the shop has.
 */
final class CustomerCode
{
    private const GROUP = 5;
    private const GROUPS = 2;

    public const LENGTH = self::GROUP * self::GROUPS;

    /** Ten characters and the hyphen between them. */
    public const STORED_LENGTH = self::LENGTH + self::GROUPS - 1;

    public static function generate(): string
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
     * What somebody typed or scanned, as the start of a customer code — or
     * null if it cannot be the start of one (F34 R15).
     *
     * The same shape as `CodeGenerator::normalise`, and deliberately so: the
     * counter's box does not know which kind of code it is about to be
     * handed, so each kind answers the same question about the same input.
     * Null is how a phone number, or a reward code's eight characters typed
     * in full, declines to be asked about customer codes at all.
     */
    public static function normalise(string $input): ?string
    {
        $letters = str_replace([' ', '-'], '', strtoupper(trim($input)));
        $length = \strlen($letters);

        if (0 === $length || $length > self::LENGTH) {
            return null;
        }

        if ($length !== strspn($letters, Alphabet::CHARACTERS)) {
            return null;
        }

        if ($length <= self::GROUP) {
            return $letters;
        }

        return substr($letters, 0, self::GROUP).'-'.substr($letters, self::GROUP);
    }

    /** What a complete customer code looks like, for anything recognising one. */
    public static function pattern(): string
    {
        return sprintf(
            '/^[%s]{%d}(-[%s]{%d}){%d}$/',
            Alphabet::CHARACTERS,
            self::GROUP,
            Alphabet::CHARACTERS,
            self::GROUP,
            self::GROUPS - 1,
        );
    }
}
