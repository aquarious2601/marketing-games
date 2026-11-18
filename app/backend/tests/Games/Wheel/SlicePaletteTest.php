<?php

declare(strict_types=1);

namespace App\Tests\Games\Wheel;

use App\Games\Wheel\Entity\Wheel;
use App\Games\Wheel\SlicePalette;
use PHPUnit\Framework\TestCase;

final class SlicePaletteTest extends TestCase
{
    private SlicePalette $palette;

    protected function setUp(): void
    {
        $this->palette = new SlicePalette();
    }

    public function testItCoversEveryPositionAWheelCanHave(): void
    {
        self::assertGreaterThanOrEqual(
            Wheel::MAX_PRIZES,
            \count($this->palette->all()),
            'A full wheel should never need to reuse a colour.',
        );
    }

    public function testEveryColourIsDistinct(): void
    {
        $colours = $this->palette->all();

        self::assertCount(\count($colours), array_unique($colours));
    }

    public function testEveryColourIsAnUppercaseHexTriplet(): void
    {
        foreach ($this->palette->all() as $colour) {
            self::assertMatchesRegularExpression('/^#[0-9A-F]{6}$/', $colour);
        }
    }

    public function testItReturnsTheColourForAPosition(): void
    {
        $colours = $this->palette->all();

        self::assertSame($colours[0], $this->palette->colourFor(0));
        self::assertSame($colours[3], $this->palette->colourFor(3));
    }

    public function testItWrapsBeyondTheEndOfThePalette(): void
    {
        $count = \count($this->palette->all());

        self::assertSame($this->palette->colourFor(0), $this->palette->colourFor($count));
        self::assertSame($this->palette->colourFor(2), $this->palette->colourFor($count + 2));
    }

    /**
     * Positions are never negative today, but PHP's modulo returns a negative
     * for a negative operand, which would be an undefined array index rather
     * than a wrong colour. Guarding is cheaper than the fatal error.
     */
    public function testItHandlesANegativePositionWithoutFailing(): void
    {
        self::assertMatchesRegularExpression('/^#[0-9A-F]{6}$/', $this->palette->colourFor(-1));
    }

    /**
     * White label text sits on these colours, so each needs a contrast ratio
     * of at least 4.5:1 against white to meet WCAG AA.
     */
    public function testEveryColourCarriesWhiteTextAtWcagAa(): void
    {
        foreach ($this->palette->all() as $colour) {
            self::assertGreaterThanOrEqual(
                4.5,
                $this->contrastWithWhite($colour),
                sprintf('%s is too light for white label text.', $colour),
            );
        }
    }

    private function contrastWithWhite(string $hex): float
    {
        $luminance = $this->relativeLuminance($hex);

        return 1.05 / ($luminance + 0.05);
    }

    /** https://www.w3.org/TR/WCAG21/#dfn-relative-luminance */
    private function relativeLuminance(string $hex): float
    {
        $channels = array_map(
            static function (string $pair): float {
                $value = hexdec($pair) / 255;

                return $value <= 0.04045
                    ? $value / 12.92
                    : (($value + 0.055) / 1.055) ** 2.4;
            },
            str_split(ltrim($hex, '#'), 2),
        );

        return 0.2126 * $channels[0] + 0.7152 * $channels[1] + 0.0722 * $channels[2];
    }
}
