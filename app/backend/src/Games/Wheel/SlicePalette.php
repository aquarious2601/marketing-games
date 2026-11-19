<?php

declare(strict_types=1);

namespace App\Games\Wheel;

/**
 * Slice colours, derived from position rather than stored (F01 R14).
 *
 * Deriving means reordering the prizes recolours the wheel and no stale colour
 * can ever be persisted against a prize.
 *
 * Every colour here is dark enough for white label text to clear the WCAG AA
 * contrast ratio of 4.5:1 — the measured ratio is noted against each, and a
 * test enforces it — and neighbours are far enough apart in hue to be told
 * apart, including by the most common forms of colour blindness.
 *
 * The frontend holds the same list so it can colour prizes that have not been
 * saved yet. An end-to-end test asserts the two agree.
 */
final class SlicePalette
{
    /** @var list<string> */
    private const COLOURS = [
        '#475569', // slate 600   7.58:1
        '#E11D48', // rose 600    4.70:1
        '#0369A1', // sky 700     5.93:1
        '#B45309', // amber 700   5.02:1
        '#047857', // emerald 700 5.48:1
        '#7C3AED', // violet 600  5.70:1
        '#C2410C', // orange 700  5.18:1
        '#0F766E', // teal 700    5.47:1
        '#C026D3', // fuchsia 600 4.71:1
        '#4D7C0F', // lime 700    4.99:1
        '#0E7490', // cyan 700    5.36:1
        '#4F46E5', // indigo 600  6.29:1
    ];

    /**
     * Wraps, so a wheel longer than the palette still gets a colour. With the
     * 12-prize cap (F01 R1) that cannot currently happen, but the cap is a
     * product decision and this should not break if it changes.
     */
    public function colourFor(int $position): string
    {
        $count = \count(self::COLOURS);

        return self::COLOURS[(($position % $count) + $count) % $count];
    }

    /**
     * @return list<string>
     */
    public function all(): array
    {
        return self::COLOURS;
    }
}
