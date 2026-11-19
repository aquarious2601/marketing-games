<?php

declare(strict_types=1);

namespace App\Branding;

use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\File\UploadedFile;

/**
 * Everything to do with the logo file on disk (F04 R13–R21).
 *
 * The whole class exists to keep one rule in one place: nothing about an
 * upload is believed. Not its name, not the content type the browser
 * declared, not its extension. The file is opened and looked at, and the
 * name it is stored under is generated here.
 */
final class LogoStore
{
    /** F04 R15 */
    public const MAX_BYTES = 2 * 1024 * 1024;

    public const SVG_CONTENT_TYPE = 'image/svg+xml';

    /**
     * Raster formats, verified by reading the file. SVG is handled
     * separately because it is a document rather than a bitmap — see
     * SvgSanitiser and F05.
     *
     * @var array<int, string> image type constant => content type served back
     */
    private const ACCEPTED = [
        \IMAGETYPE_PNG => 'image/png',
        \IMAGETYPE_JPEG => 'image/jpeg',
        \IMAGETYPE_WEBP => 'image/webp',
    ];

    public function __construct(
        #[Autowire('%kernel.project_dir%/var/uploads/branding')]
        private readonly string $directory,
        private readonly SvgSanitiser $svg,
    ) {
    }

    /**
     * @return array{filename: string, contentType: string, removed: list<string>}
     *
     * @throws LogoRejected
     */
    public function store(UploadedFile $file): array
    {
        if (!$file->isValid()) {
            throw new LogoRejected('logo.upload_failed', [], 'The upload did not complete.');
        }

        if ($file->getSize() > self::MAX_BYTES) {
            throw new LogoRejected(
                'logo.too_large',
                ['%max%' => (int) (self::MAX_BYTES / 1024 / 1024)],
                'The logo is too large.',
            );
        }

        $contents = (string) file_get_contents($file->getPathname());

        // F05 R2: decided by reading the file, not by its name or the
        // content type the browser declared.
        return SvgSanitiser::looksLikeSvg($contents)
            ? $this->storeSvg($contents)
            : $this->storeRaster($file);
    }

    /**
     * @return array{filename: string, contentType: string, removed: list<string>}
     *
     * @throws LogoRejected
     */
    private function storeRaster(UploadedFile $file): array
    {
        $contentType = $this->verifyIsAnAcceptedImage($file->getPathname());

        // F04 R20. The uploader never chooses the name: a name they control
        // is a path traversal and an overwrite waiting to happen.
        $filename = bin2hex(random_bytes(16)).$this->extensionFor($contentType);

        $this->ensureDirectory();
        $file->move($this->directory, $filename);

        return ['filename' => $filename, 'contentType' => $contentType, 'removed' => []];
    }

    /**
     * F05 R6. What lands on disk is the sanitiser's output; the uploaded
     * bytes are never written anywhere they could be served from.
     *
     * @return array{filename: string, contentType: string, removed: list<string>}
     *
     * @throws LogoRejected
     */
    private function storeSvg(string $contents): array
    {
        ['svg' => $clean, 'removed' => $removed] = $this->svg->clean($contents);

        $filename = bin2hex(random_bytes(16)).'.svg';

        $this->ensureDirectory();

        if (false === file_put_contents($this->pathFor($filename), $clean)) {
            throw new \RuntimeException('Could not write the sanitised logo.');
        }

        return [
            'filename' => $filename,
            'contentType' => self::SVG_CONTENT_TYPE,
            'removed' => $removed,
        ];
    }

    public function pathFor(string $filename): string
    {
        // Defensive: the stored name is always generated, but a value read
        // back from the database should still never be able to climb out of
        // the upload directory.
        return $this->directory.'/'.basename($filename);
    }

    public function exists(string $filename): bool
    {
        return is_file($this->pathFor($filename));
    }

    public function delete(?string $filename): void
    {
        if (null === $filename) {
            return;
        }

        $path = $this->pathFor($filename);

        if (is_file($path)) {
            @unlink($path);
        }
    }

    /**
     * F04 R16. `getimagesize` parses the file header, so a text file renamed
     * to .png and declared as image/png fails here. It is part of PHP's core
     * rather than GD, so this works wherever the app runs.
     *
     * @throws LogoRejected
     */
    private function verifyIsAnAcceptedImage(string $path): string
    {
        $info = @getimagesize($path);

        if (false === $info) {
            throw new LogoRejected('logo.not_an_image', [], 'That file is not an image.');
        }

        $type = $info[2] ?? null;

        if (!\is_int($type) || !isset(self::ACCEPTED[$type])) {
            throw new LogoRejected('logo.wrong_type', [], 'The logo is not an accepted image type.');
        }

        return self::ACCEPTED[$type];
    }

    private function extensionFor(string $contentType): string
    {
        return match ($contentType) {
            'image/png' => '.png',
            'image/jpeg' => '.jpg',
            'image/webp' => '.webp',
            default => '',
        };
    }

    private function ensureDirectory(): void
    {
        if (!is_dir($this->directory) && !mkdir($this->directory, 0o775, true) && !is_dir($this->directory)) {
            throw new \RuntimeException(sprintf('Could not create %s.', $this->directory));
        }
    }
}
