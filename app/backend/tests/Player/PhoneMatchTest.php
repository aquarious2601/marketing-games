<?php

declare(strict_types=1);

namespace App\Tests\Player;

use App\Player\PhoneMatch;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * F19 R2–R8.
 *
 * The function the feature stands on, and it has two halves that pull against
 * each other. If two spellings of one number do not match, that person is two
 * players again — the bug this fixes. If two different numbers do match, one
 * customer is shown another customer's history, which is worse. Both halves
 * are asserted below, and the second half is the one a fixed-length key gets
 * wrong.
 *
 * The cases are the spellings people type and paste, and the countries whose
 * national form is shaped differently — including the two shapes that rule
 * out a fixed-length key: a national number shorter than the key (Singapore)
 * and two different numbers sharing its last digits (two French mobile
 * prefixes).
 */
final class PhoneMatchTest extends TestCase
{
    /**
     * F19 R6, R7. The number from the report, written every way it arrives:
     * as dialled in France, without its trunk zero, with a `+`, with the
     * `00` that means the same thing, bare after a copy out of a chat app,
     * and punctuated the way the French write it down.
     */
    #[DataProvider('spellingsOfOneFrenchNumber')]
    public function testEverySpellingOfANumberIsTheSamePerson(string $typed): void
    {
        self::assertTrue(
            PhoneMatch::same('0614856240', $typed),
            sprintf('%s is the same person as 0614856240.', $typed),
        );
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function spellingsOfOneFrenchNumber(): iterable
    {
        yield 'as dialled' => ['0614856240'];
        yield 'without the trunk zero' => ['614856240'];
        yield 'international' => ['+33614856240'];
        yield 'international the long way' => ['0033614856240'];
        yield 'pasted, code but no plus' => ['33614856240'];
        yield 'spaced the way it is written' => ['+33 6 14 85 62 40'];
        yield 'with dots' => ['06.14.85.62.40'];
        yield 'with dashes and brackets' => ['(0)6-14-85-62-40'];
        yield 'with a non-breaking space' => ["+33\u{00A0}614856240"];
    }

    /**
     * F19 R6, R8. No country is configured anywhere in this feature, so each
     * of these is the same assertion: a national form and its international
     * form are one person, whatever the dialling code is.
     *
     * Italy is the case that catches a rule which strips a leading zero
     * unconditionally: an Italian landline keeps its own in both spellings.
     * Singapore, Hong Kong and Denmark are the cases that catch a key of
     * nine digits, because their whole national number is eight.
     */
    #[DataProvider('nationalAndInternational')]
    public function testANationalNumberAndItsInternationalFormAreOnePerson(
        string $national,
        string $international,
    ): void {
        self::assertTrue(
            PhoneMatch::same($national, $international),
            sprintf('%s and %s are one person.', $national, $international),
        );
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function nationalAndInternational(): iterable
    {
        yield 'France' => ['0614856240', '+33614856240'];
        yield 'Vietnam' => ['0912345678', '+84912345678'];
        yield 'China' => ['13912345678', '+8613912345678'];
        yield 'United Kingdom' => ['07911123456', '+447911123456'];
        yield 'Germany' => ['015123456789', '+4915123456789'];
        yield 'Italy, which keeps its zero' => ['0612345678', '+390612345678'];
        yield 'Spain, which has no trunk zero' => ['612345678', '+34612345678'];
        yield 'United States' => ['6505551234', '+16505551234'];
        yield 'Singapore, eight digits' => ['81234567', '+6581234567'];
        yield 'Hong Kong, eight digits' => ['61234567', '+85261234567'];
        yield 'Denmark, eight digits' => ['12345678', '+4512345678'];
    }

    /**
     * F19 R4, R8, and the half that matters most. These pairs are different
     * people and have to stay that way.
     *
     * The first two are the reason this is a suffix rule and not a key of
     * the last nine digits: `06` and `07` are both French mobile prefixes
     * and `650` and `250` are both American area codes, so each pair shares
     * its last nine digits while being two people. Two numbers of the same
     * length can never be a suffix of one another, which is what keeps them
     * apart.
     */
    #[DataProvider('differentPeople')]
    public function testTwoDifferentNumbersAreTwoPeople(string $one, string $other): void
    {
        self::assertFalse(
            PhoneMatch::same($one, $other),
            sprintf('%s and %s were merged into one person.', $one, $other),
        );
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function differentPeople(): iterable
    {
        yield 'two French mobile prefixes' => ['0614856240', '0714856240'];
        yield 'two American area codes' => ['+16505551234', '+12505551234'];
        yield 'one number, two countries' => ['+33614856240', '+84614856240'];
        yield 'the two real players' => ['0614856240', '0659041552'];
        yield 'the last digit differs' => ['0614856240', '0614856241'];
        yield 'two landlines in one town' => ['0145678901', '0145678902'];
        yield 'two Vietnamese mobiles' => ['0912345678', '0987654321'];
    }

    /**
     * F19 R3. A number shorter than the minimum overlap matches only
     * exactly, because a six-digit number is the end of a great many longer
     * ones and F08 accepts six digits.
     */
    #[DataProvider('shortNumbers')]
    public function testAShortNumberIsNotSwallowedByALongerOne(string $short, string $long): void
    {
        self::assertFalse(
            PhoneMatch::same($short, $long),
            sprintf('%s was read as the end of %s.', $short, $long),
        );
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function shortNumbers(): iterable
    {
        yield 'six digits' => ['123456', '+849123456'];
        yield 'seven digits' => ['1234567', '+841234567'];
    }

    /** F19 R3: and it still matches itself. */
    public function testAShortNumberIsStillItself(): void
    {
        self::assertTrue(PhoneMatch::same('123456', '123456'));
        self::assertTrue(PhoneMatch::same('123456', '(12) 34-56'));
    }

    /** A number is always itself, whatever its shape. */
    #[DataProvider('spellingsOfOneFrenchNumber')]
    public function testANumberIsAlwaysItself(string $typed): void
    {
        self::assertTrue(PhoneMatch::same($typed, $typed));
    }

    /**
     * Symmetric, because the upgrade step groups a whole table with it and
     * the order rows come back in must not decide who is whose duplicate.
     */
    #[DataProvider('nationalAndInternational')]
    public function testItAnswersTheSameWayRound(string $national, string $international): void
    {
        self::assertSame(
            PhoneMatch::same($national, $international),
            PhoneMatch::same($international, $national),
        );
    }

    /** F19 R4: the tail narrows, and is never longer than its length. */
    public function testTheTailIsTheLastFewDigitsAndNoMore(): void
    {
        self::assertSame('856240', PhoneMatch::tail('+33 6 14 85 62 40'));
        self::assertSame(PhoneMatch::TAIL_LENGTH, \strlen(PhoneMatch::tail('+12345678901234567890')));
        self::assertSame('123456', PhoneMatch::tail('123456'), 'a short number keeps what it has');
    }

    /**
     * F19 R4. The property the lookup depends on: two numbers that match
     * share a tail, so narrowing by tail can never hide a match. Asserted
     * over every pair above rather than argued in a comment.
     */
    #[DataProvider('nationalAndInternational')]
    public function testTwoSpellingsOfOneNumberShareATail(
        string $national,
        string $international,
    ): void {
        self::assertSame(
            PhoneMatch::tail($national),
            PhoneMatch::tail($international),
            sprintf('A lookup for %s would never consider %s.', $national, $international),
        );
    }
}
