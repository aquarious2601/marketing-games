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
    public function testItIsTenCharactersInTwoGroups(): void
    {
        self::assertMatchesRegularExpression(CustomerCode::pattern(), CustomerCode::generate());
        self::assertSame(11, \strlen(CustomerCode::generate()));
    }

    /** R2. No O against 0, no I or L against 1. */
    public function testItUsesNothingThatGetsMisread(): void
    {
        for ($attempt = 0; $attempt < 200; ++$attempt) {
            $letters = str_replace('-', '', CustomerCode::generate());

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
        self::assertSame('M9PXK-4T7VH', CustomerCode::normalise($typed));
    }

    /** @return iterable<string, array{string}> */
    public static function spellings(): iterable
    {
        yield 'as issued' => ['M9PXK-4T7VH'];
        yield 'no hyphen' => ['M9PXK4T7VH'];
        yield 'lower case' => ['m9pxk-4t7vh'];
        yield 'with spaces' => [' M9PXK 4T7VH '];
        yield 'scanned with a carriage return' => ["M9PXK4T7VH\r"];
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
        yield 'a phone number' => ['0912345678'];
        yield 'too long' => ['M9PXK4T7VHX'];
        yield 'nothing' => [''];
        yield 'a hyphen alone' => ['-'];
        yield 'a letter no code contains' => ['M9PXK4T7VO'];
        yield 'an accent from somebody keyboard' => ['M9PXK4T7Vé'];
    }

    /** R15. A partial card is a partial card, so staff can type as they go. */
    public function testItKeepsAPartialCard(): void
    {
        self::assertSame('M9PXK', CustomerCode::normalise('m9pxk'));
        self::assertSame('M9PXK-4T7', CustomerCode::normalise('M9PXK4T7'));
    }
}
