<?php

declare(strict_types=1);

namespace App\Tests\Reward;

use App\Reward\CodeGenerator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * F13 R17, R18.
 *
 * A voucher code is read off one screen and typed into another by somebody
 * who is not concentrating, so the properties worth testing are the ones
 * that make that survivable: no character that gets confused for another,
 * and no two the same.
 */
final class CodeGeneratorTest extends TestCase
{
    private CodeGenerator $codes;

    protected function setUp(): void
    {
        $this->codes = new CodeGenerator();
    }

    /**
     * F39 R1. Digits and nothing else, which is what lets the barcode use
     * the numeric mode and come out a quarter narrower.
     */
    public function testItIsDigitsOnly(): void
    {
        for ($i = 0; $i < 2_000; ++$i) {
            $code = $this->codes->generate();

            self::assertMatchesRegularExpression(
                '/^[0-9 ]+$/',
                $code,
                sprintf('%s contains something that is not a digit.', $code),
            );
        }
    }

    /** F39 R2. Ten digits, as four and then two threes. */
    public function testItIsGroupedSoItCanBeReadAloud(): void
    {
        self::assertMatchesRegularExpression(CodeGenerator::pattern(), $this->codes->generate());
        self::assertSame(12, \strlen($this->codes->generate()));
        self::assertSame(10, \strlen(str_replace(' ', '', $this->codes->generate())));
    }

    /**
     * F13 R17 as far as a unit test can go.
     *
     * Ten thousand codes with no repeat does not *prove* uniqueness — the
     * unique index does that, and SpinControllerTest exercises it through
     * the real database. What this catches is a generator with far less
     * entropy than it looks like it has, which is the failure that would
     * otherwise show up as a collision in production months later.
     */
    public function testTenThousandCodesAreAllDifferent(): void
    {
        $seen = [];

        for ($i = 0; $i < 10_000; ++$i) {
            $seen[$this->codes->generate()] = true;
        }

        self::assertCount(10_000, $seen);
    }

    // ------------------------------------------------- reading one back in

    /**
     * F16 R8: what staff type is not what the player reads out.
     *
     */
    #[DataProvider('carelesslyTypedCodes')]
    public function testItNormalisesWhatSomebodyTyped(string $typed, string $expected): void
    {
        self::assertSame($expected, CodeGenerator::normalise($typed));
    }

    /** @return iterable<string, array{string, string}> */
    public static function carelesslyTypedCodes(): iterable
    {
        yield 'as issued' => ['4821 739 506', '4821 739 506'];
        yield 'without the spaces' => ['4821739506', '4821 739 506'];
        yield 'with hyphens instead' => ['4821-739-506', '4821 739 506'];
        yield 'spaces everywhere' => [' 4 8 2 1 7 3 9 5 0 6 ', '4821 739 506'];
        // The grouping goes where it must, not where it was typed.
        yield 'grouped wrongly' => ['48 217 39506', '4821 739 506'];
        yield 'a prefix shorter than a group' => ['482', '482'];
        yield 'a prefix exactly one group' => ['4821', '4821'];
        yield 'a prefix into the second group' => ['48217', '4821 7'];
        yield 'a single digit' => ['7', '7'];
    }

    /**
     * F16 R12: null means "do not ask the code column about this", which is
     * how a phone number keeps searching for a person.
     *
     */
    #[DataProvider('thingsThatAreNotCodes')]
    public function testItRefusesWhatCannotBeACode(string $typed): void
    {
        self::assertNull(CodeGenerator::normalise($typed));
    }

    /** @return iterable<string, array{string}> */
    public static function thingsThatAreNotCodes(): iterable
    {
        yield 'longer than a code' => ['48217395061'];
        yield 'empty' => [''];
        yield 'only spaces' => ['   '];
        yield 'only a hyphen' => ['-'];
        // F39 R1: a code is digits, so anything else is somebody typing a
        // name, a note, or the wrong box.
        yield 'a letter' => ['4821 739 50A'];
        yield 'a word' => ['free coffee'];
        yield 'an L' => ['A7K3-M9PL'];
        yield 'a zero' => ['A7K3-M9P0'];
        yield 'a one' => ['A7K3-M9P1'];
        yield 'a U, which words are made of' => ['A7K3-M9PU'];
        yield 'punctuation' => ['A7K3/M9PX'];
        yield 'an accent' => ['A7K3-M9PÉ'];
    }

    /**
     * Anything the generator produces survives the round trip, which is the
     * property that matters: the code on the player's screen is the code
     * staff can type back in.
     */
    public function testEveryGeneratedCodeNormalisesToItself(): void
    {
        for ($i = 0; $i < 500; ++$i) {
            $code = $this->codes->generate();

            self::assertSame($code, CodeGenerator::normalise($code));
            self::assertSame($code, CodeGenerator::normalise(strtolower(str_replace('-', '', $code))));
        }
    }

    /** Every position varies, so no group is secretly constant. */
    public function testEveryPositionVaries(): void
    {
        $byPosition = array_fill(0, 12, []);

        for ($i = 0; $i < 500; ++$i) {
            foreach (str_split($this->codes->generate()) as $position => $character) {
                $byPosition[$position][$character] = true;
            }
        }

        foreach ($byPosition as $position => $characters) {
            // F39 R2: `4821 739 506`, so positions 4 and 8 are the spaces
            // between the groups and are meant to be constant.
            $expected = \in_array($position, [4, 8], true) ? 1 : 10;

            self::assertGreaterThanOrEqual(
                $expected,
                \count($characters),
                sprintf('Position %d barely varies.', $position),
            );
        }
    }
}
