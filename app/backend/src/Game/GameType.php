<?php

declare(strict_types=1);

namespace App\Game;

/**
 * What kind of game a game is (F27 R3).
 *
 * A type decides what "what it gives away" means — slices with odds for a
 * wheel, a plain list for a sheet — which is why F27 R5 makes it immutable:
 * changing it would leave a configuration that describes nothing.
 */
enum GameType: string
{
    case Wheel = 'wheel';
    case GiftSheet = 'gift-sheet';

    /**
     * Unlike Theme::fromStored (F04 R8), an unrecognised value throws rather
     * than falling back. A theme that cannot be read can show the plain one
     * and nobody is harmed; a game whose type cannot be read has no honest
     * behaviour to fall back to, and guessing "wheel" would hand somebody a
     * draw where a sheet was promised.
     */
    public static function fromStored(string $value): self
    {
        return self::from($value);
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $t): string => $t->value, self::cases());
    }
}
