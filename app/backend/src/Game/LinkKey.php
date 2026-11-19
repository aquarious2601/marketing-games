<?php

declare(strict_types=1);

namespace App\Game;

/**
 * Mints the key a game is reached by (F27 R19).
 *
 * Opaque and unguessable: it names no store, no game, no type and no number,
 * so a key gives away nothing about the installation and one key tells you
 * nothing about the next.
 */
final class LinkKey
{
    public const LENGTH = 12;

    /**
     * No 0/O, 1/I/l, 5/S or 8/B. A key goes on a poster, and the camera
     * sometimes fails — somebody then reads it aloud at the counter, and an
     * alphabet with look-alikes in it turns that into an argument.
     *
     * 29 characters over 12 places is about 58 bits, which is beyond
     * guessing by anybody who would have to ask the server each time.
     */
    private const ALPHABET = '23467abcdefghijkmnpqrtuvwxyz';

    public static function mint(): string
    {
        $alphabet = self::ALPHABET;
        $last = \strlen($alphabet) - 1;
        $key = '';

        for ($i = 0; $i < self::LENGTH; ++$i) {
            $key .= $alphabet[random_int(0, $last)];
        }

        return $key;
    }

    /**
     * Whether a string could be a key at all, so a malformed one is a 404
     * from the router rather than a database round trip (F27 R25 wants the
     * unknown and the ended cases indistinguishable, and this keeps them so).
     */
    public static function looksLikeOne(string $candidate): bool
    {
        return 1 === preg_match('/^['.self::ALPHABET.']{'.self::LENGTH.'}$/', $candidate);
    }
}
