<?php

declare(strict_types=1);

namespace App\Tests\Reward;

use App\Reward\CodeGenerator;
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
