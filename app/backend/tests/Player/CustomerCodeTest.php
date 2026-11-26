<?php

declare(strict_types=1);

namespace App\Tests\Player;

use App\Code\Alphabet;
use App\Player\CustomerCode;
use App\Reward\CodeGenerator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * F34 R2, R3, R5, R15.
 *
 * The card is photographed rather than read aloud, which is the one way it
 * differs from a reward code in use — and it is still typed by staff when
 * the photograph is blurred, so the alphabet matters for the same reason.
 */
final class CustomerCodeTest extends TestCase
{
    /** R2 */
    /** F39 R3. Twelve digits in three groups of four. */
    public function testItIsTwelveDigitsInThreeGroups(): void
    {
        self::assertMatchesRegularExpression(CustomerCode::pattern(), CustomerCode::generate());
        self::assertSame(14, \strlen(CustomerCode::generate()));
        self::assertSame(12, \strlen(str_replace(' ', '', CustomerCode::generate())));
    }

    /** F39 R1. Digits, which is what the scanner's numeric mode needs. */
    public function testItUsesNothingThatGetsMisread(): void
    {
        for ($attempt = 0; $attempt < 200; ++$attempt) {
            $letters = str_replace(' ', '', CustomerCode::generate());

            self::assertSame(
                \strlen($letters),
                strspn($letters, Alphabet::CHARACTERS),
                sprintf('%s contains a character no code should.', $letters),
            );
        }
    }

    /**
     * R2, and the reason the length is what it is: a customer code and a
     * reward code must never be the same string, so the counter's one box
     * can take either.
     */
    public function testItCanNeverBeARewardCode(): void
    {
        $rewards = new CodeGenerator();

        for ($attempt = 0; $attempt < 50; ++$attempt) {
            self::assertNotSame(
                \strlen($rewards->generate()),
                \strlen(CustomerCode::generate()),
            );
        }
    }

    /** R5. Not a credential, but not a counter either: it says nothing. */
    public function testItIsNotSequential(): void
    {
        $codes = [];

        for ($attempt = 0; $attempt < 200; ++$attempt) {
            $codes[] = CustomerCode::generate();
        }

        self::assertCount(200, array_unique($codes));
    }

    /** R15. Case, spaces and the hyphen are noise. */
    #[DataProvider('spellings')]
    public function testItReadsEverySpellingTheSameWay(string $typed): void
    {
        self::assertSame('5207 4418 9163', CustomerCode::normalise($typed));
    }

    /** @return iterable<string, array{string}> */
    public static function spellings(): iterable
    {
        yield 'as issued' => ['5207 4418 9163'];
        yield 'without the spaces' => ['520744189163'];
        yield 'with hyphens instead' => ['5207-4418-9163'];
        yield 'grouped wrongly' => ['52 0744 189163'];
        yield 'scanned with a carriage return' => ["520744189163\r"];
    }

    /**
     * R15, as F16 R12 has it: null is how an input declines to be asked
     * about codes at all, so a phone number never reaches the code columns.
     */
    #[DataProvider('notCards')]
    public function testItRefusesWhatCannotBeACard(string $typed): void
    {
        self::assertNull(CustomerCode::normalise($typed));
    }

    /** @return iterable<string, array{string}> */
    public static function notCards(): iterable
    {
        yield 'too long' => ['5207441891634'];
        yield 'nothing' => [''];
        yield 'a hyphen alone' => ['-'];
        yield 'a letter' => ['5207 4418 916A'];
        yield 'an accent from somebody keyboard' => ['5207 4418 916é'];
    }

    /**
     * F39 R13, R14, and the cost the old alphabet used to cover for free.
     *
     * Ten digits is a phone number and also the start of a card, so this no
     * longer declines to be asked. The counter's box asks both columns and
     * shows what matched, which is why that is survivable — see F39 §13.
     */
    public function testAPhoneNumberIsNowAPossibleCard(): void
    {
        self::assertSame('0912 3456 78', CustomerCode::normalise('0912345678'));
    }

    /** R15. A partial card is a partial card, so staff can type as they go. */
    public function testItKeepsAPartialCard(): void
    {
        self::assertSame('5207', CustomerCode::normalise('5207'));
        self::assertSame('5207 4418 91', CustomerCode::normalise('52074418 91'));
    }
}
