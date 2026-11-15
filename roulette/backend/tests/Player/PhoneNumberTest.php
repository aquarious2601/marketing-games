<?php

declare(strict_types=1);

namespace App\Tests\Player;

use App\Player\PhoneNumber;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * F08 R3, R4.
 *
 * This is the function the whole feature is keyed on: if two spellings of one
 * number canonicalise differently, that person becomes two players and the
 * admin list grows a duplicate nobody can merge. So the cases below are the
 * spellings people actually type and paste, not a tidy set of digits.
 */
final class PhoneNumberTest extends TestCase
{
    /** F08 R3 */
    #[DataProvider('spellingsOfOneNumber')]
    public function testItCanonicalisesEverySpellingOfANumberTheSameWay(string $typed): void
    {
        self::assertSame('0912345678', PhoneNumber::canonicalise($typed));
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function spellingsOfOneNumber(): iterable
    {
        yield 'plain' => ['0912345678'];
        yield 'spaced' => ['0912 345 678'];
        yield 'dotted' => ['091.234.5678'];
        yield 'dashed' => ['091-234-5678'];
        yield 'bracketed' => ['(091) 234 5678'];
        yield 'padded' => ['  0912345678  '];
        yield 'mixed punctuation' => ['091/234.5678'];
        // Pasted out of a messaging app, which is where most of them come
        // from. Neither trim() nor \s removes these.
        yield 'non-breaking spaces' => ["0912\u{00A0}345\u{00A0}678"];
        yield 'narrow no-break space' => ["0912\u{202F}345678"];
    }

    /**
     * F08 R3. A leading `+` is kept because it is the one piece of
     * punctuation that carries meaning, and the shop will want to read the
     * number back as it was given.
     */
    public function testItKeepsALeadingPlus(): void
    {
        self::assertSame('+84912345678', PhoneNumber::canonicalise('+84 912 345 678'));
    }

    /** A `+` anywhere else is punctuation, not a country prefix. */
    public function testItDiscardsAPlusThatIsNotAtTheFront(): void
    {
        self::assertSame('0912345678', PhoneNumber::canonicalise('091+234+5678'));
    }

    /**
     * The accepted cost of canonicalising loosely rather than per country
     * (F08 section 13). Asserted rather than merely documented, so that the
     * day somebody adds a country setting, this test fails and points at the
     * decision it changes.
     */
    public function testANationalAndAnInternationalSpellingAreDifferentKeys(): void
    {
        self::assertNotSame(
            PhoneNumber::canonicalise('0912345678'),
            PhoneNumber::canonicalise('+84912345678'),
            'If these ever match, F08 section 13 has been resolved and should say so.',
        );
    }

    /** F08 R4 */
    #[DataProvider('unusableNumbers')]
    public function testItRejectsWhatCannotBeAPhoneNumber(string $typed): void
    {
        self::assertNull(PhoneNumber::canonicalise($typed));
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function unusableNumbers(): iterable
    {
        yield 'empty' => [''];
        yield 'spaces only' => ['   '];
        yield 'no digits at all' => ['not a number'];
        yield 'punctuation only' => ['+++'];
        yield 'five digits' => ['12345'];
        yield 'twenty-one digits' => ['123456789012345678901'];
        // Eastern Arabic numerals: a valid number to the person typing it,
        // and unreadable to the staff member checking a prize off a screen.
        yield 'non-ASCII digits' => ["\u{0660}\u{0669}\u{0661}\u{0662}\u{0663}\u{0664}\u{0665}\u{0666}"];
    }

    /** F08 R4 — the boundaries themselves, not just values near them */
    public function testItAcceptsExactlyTheAllowedLengths(): void
    {
        self::assertSame('123456', PhoneNumber::canonicalise('123456'));
        self::assertSame(
            '12345678901234567890',
            PhoneNumber::canonicalise('12345678901234567890'),
        );
    }

    /**
     * The `+` does not count towards the digit limit, so an E.164 number at
     * full length is not rejected for its own prefix.
     */
    public function testThePlusDoesNotCountTowardsTheLength(): void
    {
        self::assertSame('+12345678901234567890', PhoneNumber::canonicalise('+12345678901234567890'));
    }
}
