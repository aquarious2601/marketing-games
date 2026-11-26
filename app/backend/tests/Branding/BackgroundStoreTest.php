<?php

declare(strict_types=1);

namespace App\Tests\Branding;

use App\Branding\BackgroundStore;
use App\Branding\UploadRejected;
use App\Tests\Support\FakeImage;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpFoundation\File\UploadedFile;

/**
 * F35 R7–R12. What the store will take, and what it does with it.
 *
 * The rejections are each their own test rather than a data provider,
 * because what matters about them is the key they carry: that key is what
 * the shop owner reads, and a provider would let one of them quietly become
 * another and still pass.
 */
final class BackgroundStoreTest extends TestCase
{
    private string $directory;

    private BackgroundStore $store;

    protected function setUp(): void
    {
        $this->directory = sys_get_temp_dir().'/f35-'.bin2hex(random_bytes(6));
        $this->store = new BackgroundStore($this->directory);
    }

    protected function tearDown(): void
    {
        if (!is_dir($this->directory)) {
            return;
        }

        foreach (glob($this->directory.'/*') ?: [] as $file) {
            @unlink($file);
        }

        @rmdir($this->directory);
    }

    /** F35 R7 */
    public function testItAcceptsAPng(): void
    {
        $stored = $this->store->store($this->upload(FakeImage::png(1600, 900), 'picture.png'));

        self::assertSame('image/png', $stored['contentType']);
        self::assertStringEndsWith('.png', $stored['filename']);
        self::assertTrue($this->store->exists($stored['filename']));
    }

    /** F35 R7 */
    public function testItAcceptsAJpeg(): void
    {
        $stored = $this->store->store($this->upload(FakeImage::jpeg(2000, 1200), 'picture.jpg'));

        self::assertSame('image/jpeg', $stored['contentType']);
        self::assertStringEndsWith('.jpg', $stored['filename']);
    }

    /** F35 R7 */
    public function testItAcceptsAWebp(): void
    {
        $stored = $this->store->store($this->upload(FakeImage::webp(1280, 1280), 'picture.webp'));

        self::assertSame('image/webp', $stored['contentType']);
        self::assertStringEndsWith('.webp', $stored['filename']);
    }

    /**
     * F35 R7. The name is the uploader's only input into where this lands,
     * and it is ignored: a name they controlled would be a path traversal
     * and an overwrite waiting to happen.
     */
    public function testItNamesTheFileItself(): void
    {
        $stored = $this->store->store($this->upload(FakeImage::png(1600, 900), '../../evil.png'));

        self::assertMatchesRegularExpression('/^[0-9a-f]{32}\.png$/', $stored['filename']);
        self::assertSame(
            $this->directory.'/'.$stored['filename'],
            $this->store->pathFor($stored['filename']),
        );
    }

    /**
     * F35 R7. Declared as a PNG, named as a PNG, and not one. The only
     * thing asked is what the bytes say.
     */
    public function testItRejectsAFileThatIsNotAnImage(): void
    {
        $rejected = $this->reject($this->upload('this is not a picture', 'picture.png'));

        self::assertSame('background.not_an_image', $rejected->getKey());
    }

    /** F35 R7. A real image, of a kind this does not take. */
    public function testItRejectsAnImageOfTheWrongKind(): void
    {
        $gif = "GIF89a".pack('vv', 1600, 900)."\x80\x00\x00";

        $rejected = $this->reject($this->upload($gif, 'picture.gif'));

        self::assertSame('background.wrong_type', $rejected->getKey());
    }

    /** F35 R8, R23: the limit and the size it actually was. */
    public function testItRejectsAFileOverFiveMegabytes(): void
    {
        $fat = FakeImage::png(1600, 900).str_repeat('x', BackgroundStore::MAX_BYTES);

        $rejected = $this->reject($this->upload($fat, 'picture.png'));

        self::assertSame('background.too_large', $rejected->getKey());
        self::assertSame(5, $rejected->getParameters()['%max%']);
        self::assertArrayHasKey('%size%', $rejected->getParameters());
    }

    /** F35 R9 */
    public function testItRejectsAPictureTooSmallToCoverAPhone(): void
    {
        $rejected = $this->reject($this->upload(FakeImage::png(900, 600), 'picture.png'));

        self::assertSame('background.too_small', $rejected->getKey());
        self::assertSame(1200, $rejected->getParameters()['%min%']);
        self::assertSame(900, $rejected->getParameters()['%width%']);
        self::assertSame(600, $rejected->getParameters()['%height%']);
    }

    /** F35 R9. The longest side, not both: a wide banner is fine. */
    public function testItMeasuresTheLongestSide(): void
    {
        $stored = $this->store->store($this->upload(FakeImage::png(1600, 400), 'banner.png'));

        self::assertTrue($this->store->exists($stored['filename']));
    }

    /** F35 R10 */
    public function testItRejectsAPictureTooBigToDecodeComfortably(): void
    {
        $rejected = $this->reject($this->upload(FakeImage::png(9000, 1200), 'huge.png'));

        self::assertSame('background.too_big', $rejected->getKey());
        self::assertSame(8000, $rejected->getParameters()['%max%']);
    }

    /** F35 R11, R12 */
    public function testItDeletesWhatItIsToldTo(): void
    {
        $stored = $this->store->store($this->upload(FakeImage::png(1600, 900), 'picture.png'));

        $this->store->delete($stored['filename']);

        self::assertFalse($this->store->exists($stored['filename']));
    }

    /** F35 R15. Nothing to delete is not a failure. */
    public function testDeletingNothingIsHarmless(): void
    {
        $this->store->delete(null);
        $this->store->delete('a-file-that-was-never-there.png');

        self::assertFalse($this->store->exists('a-file-that-was-never-there.png'));
    }

    /**
     * The extension is generated, so reading it back is reading our own
     * record rather than trusting the uploader's.
     */
    public function testItServesEachKindAsItself(): void
    {
        self::assertSame('image/png', $this->store->contentTypeFor('abc.png'));
        self::assertSame('image/jpeg', $this->store->contentTypeFor('abc.jpg'));
        self::assertSame('image/webp', $this->store->contentTypeFor('abc.webp'));
        self::assertSame('application/octet-stream', $this->store->contentTypeFor('abc'));
    }

    /** F35 R14. A replaced picture is a different URL; an unchanged one is not. */
    public function testTheUrlMovesWithTheGamesClock(): void
    {
        $key = 'abcd1234abcd1234';
        $at = new \DateTimeImmutable('@1763650000');

        self::assertSame(
            '/api/branding/background/abcd1234abcd1234?v=1763650000',
            $this->store->urlFor($key, $at),
        );
        self::assertNotSame(
            $this->store->urlFor($key, $at),
            $this->store->urlFor($key, $at->modify('+1 second')),
        );
    }

    private function reject(UploadedFile $file): UploadRejected
    {
        try {
            $this->store->store($file);
        } catch (UploadRejected $rejected) {
            return $rejected;
        }

        self::fail('The upload was stored when it should have been rejected.');
    }

    private function upload(string $contents, string $name): UploadedFile
    {
        $path = sys_get_temp_dir().'/f35-upload-'.bin2hex(random_bytes(6));
        file_put_contents($path, $contents);

        // `test: true` is what lets a file that PHP did not receive through
        // a real upload be moved; everything else about it is unchanged.
        return new UploadedFile($path, $name, null, null, true);
    }
}
