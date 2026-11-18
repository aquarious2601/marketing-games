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

    /** F13 R18 */
    public function testItNeverUsesACharacterThatIsMisread(): void
    {
        for ($i = 0; $i < 2_000; ++$i) {
            $code = $this->codes->generate();

            self::assertDoesNotMatchRegularExpression(
                '/[OIL01]/',
                $code,
                sprintf('%s contains a character that is read as another.', $code),
            );
        }
    }

    public function testItIsGroupedSoItCanBeReadAloud(): void
    {
        self::assertMatchesRegularExpression(CodeGenerator::pattern(), $this->codes->generate());
        self::assertSame(9, \strlen($this->codes->generate()));
        self::assertStringContainsString('-', $this->codes->generate());
    }

    public function testItIsUppercase(): void
    {
        $code = $this->codes->generate();

        self::assertSame(strtoupper($code), $code);
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
        yield 'as issued' => ['A7K3-M9PX', 'A7K3-M9PX'];
        yield 'lower case' => ['a7k3-m9px', 'A7K3-M9PX'];
        yield 'no hyphen' => ['a7k3m9px', 'A7K3-M9PX'];
        yield 'a space for the hyphen' => ['A7K3 M9PX', 'A7K3-M9PX'];
        yield 'spaces everywhere' => [' a 7 k 3 m 9 p x ', 'A7K3-M9PX'];
        // The hyphen goes where it must, not where it was typed.
        yield 'the hyphen in the wrong place' => ['A7-K3M9PX', 'A7K3-M9PX'];
        yield 'a prefix shorter than a group' => ['a7k', 'A7K'];
        yield 'a prefix exactly one group' => ['a7k3', 'A7K3'];
        yield 'a prefix into the second group' => ['a7k3m', 'A7K3-M'];
        yield 'a single character' => ['7', '7'];
        // F16 §13's accepted cost: four digits are a legitimate start of a
        // code as well as the end of a phone number, so this is asked of
        // both columns and may show a row from each.
        yield 'four digits, which are also a receipt' => ['5678', '5678'];
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
        yield 'a phone number' => ['0912345678'];
        yield 'longer than a code' => ['A7K3-M9PXQ'];
        yield 'empty' => [''];
        yield 'only spaces' => ['   '];
        yield 'only a hyphen' => ['-'];
        // The characters the alphabet leaves out precisely because they are
        // misread (F13 R18). Somebody typing one has misread something.
        yield 'an O for a zero' => ['A7K3-M9PO'];
        yield 'an I for a one' => ['A7K3-M9PI'];
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
        $byPosition = array_fill(0, 9, []);

        for ($i = 0; $i < 500; ++$i) {
            foreach (str_split($this->codes->generate()) as $position => $character) {
                $byPosition[$position][$character] = true;
            }
        }

        foreach ($byPosition as $position => $characters) {
            // Position 4 is the hyphen and is meant to be constant.
            $expected = 4 === $position ? 1 : 10;

            self::assertGreaterThanOrEqual(
                $expected,
                \count($characters),
                sprintf('Position %d barely varies.', $position),
            );
        }
    }
}
