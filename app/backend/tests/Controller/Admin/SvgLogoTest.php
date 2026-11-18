<?php

declare(strict_types=1);

namespace App\Tests\Controller\Admin;

use App\Branding\LogoStore;
use App\Entity\Branding;
use App\Tests\Support\DatabaseWebTestCase;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\Response;

/**
 * F05: SVG logos, and the attacks they can carry.
 *
 * The assertions that matter here are about the bytes on disk. It is not
 * enough that an upload was accepted and looks fine — what gets served to
 * every player must not contain the dangerous parts.
 */
final class SvgLogoTest extends DatabaseWebTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // F07 R17: these routes need a session now.
        $this->signInAsAdmin();
    }

    private const LOGO_URI = '/api/admin/branding/logo';

    private const CLEAN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">'
        .'<circle cx="20" cy="20" r="18" fill="#E11D48"/></svg>';

    /** @var list<string> */
    private array $temporaryFiles = [];

    protected function tearDown(): void
    {
        foreach ($this->temporaryFiles as $path) {
            if (is_file($path)) {
                @unlink($path);
            }
        }

        $this->temporaryFiles = [];

        parent::tearDown();
    }

    // ------------------------------------------------------------ accepting

    /** F05 R1, R11 */
    public function testACleanSvgIsStoredWithNoNotice(): void
    {
        $this->upload(self::CLEAN_SVG);

        self::assertResponseIsSuccessful();

        $body = $this->decodeResponse();
        self::assertNotNull($body['logoUrl']);
        self::assertNull($body['notice'], 'Nothing was removed, so nothing should be reported.');
    }

    /** F05 R12 */
    public function testItIsServedAsSvg(): void
    {
        $this->upload(self::CLEAN_SVG);

        $this->client->request('GET', '/api/branding/logo');

        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('Content-Type', 'image/svg+xml');
    }

    /** F05 R2 — the name says nothing; the contents decide */
    public function testAnSvgNamedPngIsStillTreatedAsSvg(): void
    {
        $this->upload(self::CLEAN_SVG, 'logo.png', 'image/png');

        self::assertResponseIsSuccessful();

        $this->client->request('GET', '/api/branding/logo');
        self::assertResponseHeaderSame('Content-Type', 'image/svg+xml');
    }

    public function testTheStoredFileKeepsTheSvgExtension(): void
    {
        $this->upload(self::CLEAN_SVG);

        self::assertMatchesRegularExpression('/^[0-9a-f]{32}\.svg$/', $this->storedFilename());
    }

    // ----------------------------------------------------------- sanitising

    /**
     * F05 R5, R6. Each of these is a real way to get script into an SVG. The
     * assertion is on the bytes that would be served, not on the response.
     */
    #[DataProvider('dangerousSvgs')]
    public function testTheDangerousPartIsNotInWhatGetsServed(string $svg, string $mustNotAppear): void
    {
        $this->upload($svg);

        self::assertResponseIsSuccessful();

        $stored = $this->storedContents();

        self::assertStringNotContainsStringIgnoringCase(
            $mustNotAppear,
            $stored,
            sprintf("This would have been served to every player:\n%s", $stored),
        );
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function dangerousSvgs(): iterable
    {
        yield 'a script element' => [
            '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="4"/></svg>',
            '<script',
        ];

        yield 'an onload handler' => [
            '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="4"/></svg>',
            'onload',
        ];

        yield 'an onclick handler on a child' => [
            '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4" onclick="alert(1)"/></svg>',
            'onclick',
        ];

        yield 'a javascript: link' => [
            '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">'
                .'<a xlink:href="javascript:alert(1)"><circle r="4"/></a></svg>',
            'javascript:',
        ];

        yield 'a foreignObject' => [
            '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml">'
                .'<script>alert(1)</script></body></foreignObject></svg>',
            '<script',
        ];

        yield 'an embedded iframe' => [
            '<svg xmlns="http://www.w3.org/2000/svg"><iframe src="https://evil.example/x"></iframe></svg>',
            'iframe',
        ];

        yield 'a remote image reference' => [
            '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/track.png"/></svg>',
            'evil.example',
        ];

        yield 'a remote use reference' => [
            '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">'
                .'<use xlink:href="https://evil.example/x.svg#a"/></svg>',
            'evil.example',
        ];
    }

    /** F05 R10 */
    public function testTheAdminIsToldWhenScriptsWereRemoved(): void
    {
        $this->upload('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="4"/></svg>');

        self::assertResponseIsSuccessful();

        $notice = $this->decodeResponse()['notice'];
        self::assertIsString($notice);
        self::assertStringContainsString('removed', $notice);
        self::assertStringContainsString('scripts', $notice);
    }

    public function testTheAdminIsToldWhenEventHandlersWereRemoved(): void
    {
        $this->upload('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="4"/></svg>');

        self::assertStringContainsString('event handlers', (string) $this->decodeResponse()['notice']);
    }

    /** The logo still works after cleaning — it is not emptied out. */
    public function testTheHarmlessPartOfTheSvgSurvives(): void
    {
        $this->upload('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script>'
            .'<circle cx="20" cy="20" r="18" fill="#E11D48"/></svg>');

        $stored = $this->storedContents();

        self::assertStringContainsString('<circle', $stored);
        self::assertStringContainsString('#E11D48', $stored);
    }

    // ------------------------------------------------------------- refusing

    /**
     * F05 R9. Not untidiness: an entity declaration is the opening move of a
     * billion-laughs expansion or an attempt to read local files.
     */
    public function testAnSvgDeclaringEntitiesIsRefused(): void
    {
        $svg = '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY lol "ha">]>'
            .'<svg xmlns="http://www.w3.org/2000/svg"><text>&lol;</text></svg>';

        $this->upload($svg);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertStringContainsString('entities', $this->firstViolationMessage());
        self::assertNull($this->currentLogoFilename(), 'Nothing should have been stored.');
    }

    public function testABillionLaughsPayloadIsRefused(): void
    {
        $svg = '<?xml version="1.0"?><!DOCTYPE svg ['
            .'<!ENTITY a "aaaaaaaaaa">'
            .'<!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">'
            .'<!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">'
            .']><svg xmlns="http://www.w3.org/2000/svg"><text>&c;</text></svg>';

        $this->upload($svg);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
    }

    /** F05 R8 */
    public function testMalformedXmlIsRefused(): void
    {
        $this->upload('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"</svg');

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertNull($this->currentLogoFilename());
    }

    /** F05 R4 — a file claiming to be an SVG but containing nothing of the sort */
    public function testATextFileNamedSvgIsRefused(): void
    {
        $this->upload('just some words, not markup at all', 'logo.svg', 'image/svg+xml');

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertNull($this->currentLogoFilename());
    }

    public function testAnSvgOverTheSizeLimitIsRefused(): void
    {
        $padding = str_repeat('<circle r="1"/>', 200_000);
        $svg = '<svg xmlns="http://www.w3.org/2000/svg">'.$padding.'</svg>';

        self::assertGreaterThan(LogoStore::MAX_BYTES, \strlen($svg));

        $this->upload($svg);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertStringContainsString('2MB', $this->firstViolationMessage());
    }

    // -------------------------------------------------------------- serving

    /**
     * F05 R13. The layer that holds if the sanitiser ever misses something:
     * a sandboxed document cannot run script even when script is present.
     */
    public function testAnSvgIsServedSandboxed(): void
    {
        $this->upload(self::CLEAN_SVG);

        $this->client->request('GET', '/api/branding/logo');

        $csp = $this->client->getResponse()->headers->get('Content-Security-Policy');

        self::assertIsString($csp);
        self::assertStringContainsString('sandbox', $csp);
        self::assertStringContainsString("default-src 'none'", $csp);
        self::assertResponseHeaderSame('X-Content-Type-Options', 'nosniff');
    }

    /** The sandbox is for SVG; a PNG does not need it. */
    public function testARasterLogoIsNotSandboxed(): void
    {
        $png = (string) base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            true,
        );

        $this->uploadFile($this->makeFile('logo.png', $png, 'image/png'));
        self::assertResponseIsSuccessful();

        $this->client->request('GET', '/api/branding/logo');

        self::assertResponseHeaderSame('Content-Type', 'image/png');
        self::assertNull($this->client->getResponse()->headers->get('Content-Security-Policy'));
    }

    public function testReplacingAnSvgWithAPngStillWorks(): void
    {
        $this->upload(self::CLEAN_SVG);
        $first = $this->currentLogoFilename();

        $png = (string) base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            true,
        );
        $this->uploadFile($this->makeFile('logo.png', $png, 'image/png'));

        self::assertResponseIsSuccessful();

        $second = $this->currentLogoFilename();
        self::assertNotSame($first, $second);
        self::assertStringEndsWith('.png', (string) $second);
    }

    // ------------------------------------------------------------- helpers

    private function upload(string $svg, string $name = 'logo.svg', string $type = 'image/svg+xml'): void
    {
        $this->uploadFile($this->makeFile($name, $svg, $type));
    }

    private function uploadFile(UploadedFile $file): void
    {
        $this->client->request('POST', self::LOGO_URI, files: ['logo' => $file]);
    }

    private function currentLogoFilename(): ?string
    {
        $this->entityManager->clear();

        $branding = $this->entityManager->getRepository(Branding::class)->findOneBy([]);

        return $branding?->getLogoFilename();
    }

    private function storedFilename(): string
    {
        $filename = $this->currentLogoFilename();
        self::assertIsString($filename, 'No logo was stored.');

        return $filename;
    }

    private function storedContents(): string
    {
        $path = static::getContainer()->get(LogoStore::class)->pathFor($this->storedFilename());
        self::assertFileExists($path);

        return (string) file_get_contents($path);
    }

    private function firstViolationMessage(): string
    {
        return (string) $this->decodeResponse()['error']['violations'][0]['message'];
    }

    private function makeFile(string $name, string $contents, string $contentType): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'svg');
        file_put_contents($path, $contents);

        $this->temporaryFiles[] = $path;

        return new UploadedFile($path, $name, $contentType, test: true);
    }
}
