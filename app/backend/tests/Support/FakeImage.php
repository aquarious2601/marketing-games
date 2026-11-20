<?php

declare(strict_types=1);

namespace App\Tests\Support;

/**
 * Image files built by hand, for testing what reads them (F35 R7, R9, R10).
 *
 * GD is not installed everywhere this suite runs, and a test that silently
 * skips on the developer's machine is a test that only CI has ever run. What
 * `getimagesize` actually reads is the header, so that is what these build:
 * a real signature and a real dimension field, and nothing after it.
 *
 * That is also exactly the right fidelity for these tests. The store's job
 * is to decide what a file is and how big it is from its header, and a file
 * whose header says PNG and whose body is absent proves that better than a
 * real photograph would.
 */
final class FakeImage
{
    public static function png(int $width, int $height): string
    {
        return "\x89PNG\r\n\x1a\n".self::chunk('IHDR', pack(
            'NNCCCCC',
            $width,
            $height,
            8,  // bit depth
            2,  // colour type: truecolour
            0,  // compression
            0,  // filter
            0,  // interlace
        ));
    }

    /**
     * SOI, a baseline frame header carrying the dimensions, EOI.
     *
     * The frame header's length counts itself and everything after it:
     * precision, two dimensions, the component count and three bytes per
     * component.
     */
    public static function jpeg(int $width, int $height): string
    {
        $components = str_repeat("\x01\x11\x00", 3);
        $frame = pack('CnnC', 8, $height, $width, 3).$components;

        return "\xff\xd8\xff\xc0".pack('n', \strlen($frame) + 2).$frame."\xff\xd9";
    }

    /**
     * A RIFF container holding a lossy VP8 keyframe header.
     *
     * The three-byte frame tag, the sync code every VP8 keyframe carries,
     * and then the dimensions as little-endian 14-bit values — which is
     * where `getimagesize` reads them from.
     */
    public static function webp(int $width, int $height): string
    {
        $vp8 = "\x30\x01\x00\x9d\x01\x2a".pack('vv', $width, $height);
        $chunk = 'VP8 '.pack('V', \strlen($vp8)).$vp8;
        $payload = 'WEBP'.$chunk;

        return 'RIFF'.pack('V', \strlen($payload)).$payload;
    }

    private static function chunk(string $type, string $data): string
    {
        return pack('N', \strlen($data)).$type.$data.pack('N', crc32($type.$data));
    }
}
