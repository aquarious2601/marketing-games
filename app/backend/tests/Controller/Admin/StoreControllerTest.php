<?php

declare(strict_types=1);

namespace App\Tests\Controller\Admin;

use App\Branding\LogoStore;
use App\Entity\Store;
use App\Tests\Support\DatabaseWebTestCase;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\Response;

/**
 * F04 through the kernel, the database and the filesystem.
 */
final class StoreControllerTest extends DatabaseWebTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // F07 R17: these routes need a session now.
        $this->signInAsAdmin();
    }

    private const URI = '/api/admin/store';
    private const LOGO_URI = '/api/admin/store/logo';

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

    // ------------------------------------------------------------- reading

    /** F04 R1, R8 */
    public function testItCreatesPlainBrandingOnFirstRead(): void
    {
        $this->client->request('GET', self::URI);

        self::assertResponseIsSuccessful();

        $store = $this->decodeResponse();

        self::assertNull($store['companyName']);
        self::assertNull($store['logoUrl']);
        // F30 R2: the store has no theme, and does not pretend to.
        self::assertArrayNotHasKey('theme', $store);
        self::assertArrayNotHasKey('themes', $store);
    }

    /** F04 R2, R3 — trimmed, and empty means unset */
    public function testItTrimsTheCompanyNameAndStoresBlankAsUnset(): void
    {
        $this->put(self::URI, ['companyName' => '   AA Store   ']);

        self::assertResponseIsSuccessful();

        $store = $this->decodeResponse();
        self::assertSame('AA Store', $store['companyName']);
    }

    /** F04 R4 */
    public function testItAcceptsAStoreWithNoCompanyNameAtAll(): void
    {
        $this->put(self::URI, []);

        self::assertResponseIsSuccessful();
        self::assertNull($this->decodeResponse()['companyName']);
    }

    // ------------------------------------------------------------ tagline

        /** F04 R12 */
    // ------------------------------------------- F23: spins per day

    public function testItRejectsANameOverSixtyCharacters(): void
    {
        $this->put(self::URI, ['companyName' => str_repeat('a', 61)]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertStringContainsString('60', $this->decodeResponse()['error']['violations'][0]['message']);
    }

    public function testItAcceptsANameOfExactlySixtyCharacters(): void
    {
        $this->put(self::URI, ['companyName' => str_repeat('a', 60)]);

        self::assertResponseIsSuccessful();
    }

    /** F04 R6 — stored verbatim; escaping is the renderer's job */
    public function testItStoresANameContainingMarkupVerbatim(): void
    {
        $this->put(self::URI, ['companyName' => '<script>alert(1)</script>']);

        self::assertResponseIsSuccessful();
        self::assertSame('<script>alert(1)</script>', $this->decodeResponse()['companyName']);
    }

    /** F04 R5 — the two saves must not tread on each other */
    public function testSavingBrandingLeavesThePrizesAlone(): void
    {
        $this->client->request('GET', $this->wheelUri());
        $before = array_column($this->decodeResponse()['prizes'], 'name');

        $this->put(self::URI, ['companyName' => 'AA Store']);
        self::assertResponseIsSuccessful();

        $this->client->request('GET', $this->wheelUri());
        self::assertSame($before, array_column($this->decodeResponse()['prizes'], 'name'));
    }

    public function testSavingPrizesLeavesTheBrandingAlone(): void
    {
        $this->put(self::URI, ['companyName' => 'AA Store']);

        $this->client->request('GET', $this->wheelUri());
        $prizes = array_map(
            static fn (array $p): array => [
                'id' => $p['id'],
                'probability' => $p['probability'],
                'rewardId' => $p['rewardId'],
            ],
            $this->decodeResponse()['prizes'],
        );

        $this->put($this->wheelUri(), ['prizes' => $prizes]);
        self::assertResponseIsSuccessful();

        $this->client->request('GET', self::URI);
        self::assertSame('AA Store', $this->decodeResponse()['companyName']);
    }

    // --------------------------------------------------------------- logo

    /** F04 R13 */
    public function testItAcceptsAPngLogo(): void
    {
        $this->uploadLogo($this->makePng());

        self::assertResponseIsSuccessful();
        self::assertNotNull($this->decodeResponse()['logoUrl']);
        self::assertStringStartsWith('/api/branding/logo', $this->decodeResponse()['logoUrl']);
    }

    /** F04 R13 */
    public function testItAcceptsAJpegLogoAndServesItAsJpeg(): void
    {
        $this->uploadLogo($this->makeJpeg());

        self::assertResponseIsSuccessful();

        $this->client->request('GET', '/api/branding/logo');
        self::assertResponseHeaderSame('Content-Type', 'image/jpeg');
    }

    /** F04 R16 — the extension does not decide the type that is served */
    public function testAJpegNamedPngIsServedAsJpeg(): void
    {
        $this->uploadLogo($this->makeJpeg('logo.png'));

        self::assertResponseIsSuccessful();

        $this->client->request('GET', '/api/branding/logo');
        self::assertResponseHeaderSame('Content-Type', 'image/jpeg');
    }

    public function testTheUploadedLogoIsServedBack(): void
    {
        $this->uploadLogo($this->makePng());

        $this->client->request('GET', '/api/branding/logo');

        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('Content-Type', 'image/png');
    }

    /** F04 R21 */
    public function testTheLogoIsServedWithNosniff(): void
    {
        $this->uploadLogo($this->makePng());
        $this->client->request('GET', '/api/branding/logo');

        self::assertResponseHeaderSame('X-Content-Type-Options', 'nosniff');
    }

    /**
     * F04 R14 refused SVG outright. F05 supersedes that: SVG is accepted and
     * sanitised. The detailed coverage lives in SvgLogoTest; this is here so
     * that anyone reading F04's tests is not left believing the old rule.
     */
    public function testSvgIsNoLongerRefusedOutright(): void
    {
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle r="4"/></svg>';

        $this->uploadLogo($this->makeFile('logo.svg', $svg, 'image/svg+xml'));

        self::assertResponseIsSuccessful();
        self::assertNotNull($this->decodeResponse()['logoUrl']);
    }

    /** F04 R16 — the declared type and the extension are both lies here */
    public function testItRefusesATextFileClaimingToBeAPng(): void
    {
        $this->uploadLogo($this->makeFile('logo.png', 'this is definitely not a png', 'image/png'));

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);

        $this->client->request('GET', self::URI);
        self::assertNull($this->decodeResponse()['logoUrl'], 'Nothing should have been stored.');
    }

    /** F04 R15 */
    public function testItRefusesAFileOverTwoMegabytes(): void
    {
        $oversized = $this->makeFile('big.png', str_repeat('x', LogoStore::MAX_BYTES + 1), 'image/png');

        $this->uploadLogo($oversized);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertStringContainsString('2MB', $this->decodeResponse()['error']['violations'][0]['message']);
    }

    public function testItRefusesARequestWithNoFile(): void
    {
        $this->client->request('POST', self::LOGO_URI);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('logo', $this->decodeResponse()['error']['violations'][0]['field']);
    }

    /** F04 R20 — the uploader never names the stored file */
    public function testTheStoredFilenameIsGeneratedNotTaken(): void
    {
        $this->uploadLogo($this->makePng('../../evil.png'));

        self::assertResponseIsSuccessful();

        $store = $this->entityManager->getRepository(Store::class)->findOneBy([]);
        self::assertInstanceOf(Store::class, $store);

        $filename = (string) $store->getLogoFilename();
        self::assertMatchesRegularExpression('/^[0-9a-f]{32}\.png$/', $filename);
        self::assertStringNotContainsString('evil', $filename);
        self::assertStringNotContainsString('..', $filename);
    }

    /** F04 R17 */
    public function testReplacingTheLogoDeletesThePreviousFile(): void
    {
        $this->uploadLogo($this->makePng());
        $first = $this->currentLogoPath();
        self::assertFileExists($first);

        $this->uploadLogo($this->makePng());
        $second = $this->currentLogoPath();

        self::assertNotSame($first, $second);
        self::assertFileDoesNotExist($first, 'The replaced logo should have been deleted.');
        self::assertFileExists($second);
    }

    /** F04 R18 */
    public function testRemovingTheLogoDeletesTheFile(): void
    {
        $this->uploadLogo($this->makePng());
        $path = $this->currentLogoPath();

        $this->client->request('DELETE', self::LOGO_URI);

        self::assertResponseIsSuccessful();
        self::assertNull($this->decodeResponse()['logoUrl']);
        self::assertFileDoesNotExist($path);
    }

    public function testRequestingTheLogoWhenNoneIsSetIsNotFound(): void
    {
        $this->client->request('GET', '/api/branding/logo');

        self::assertResponseStatusCodeSame(Response::HTTP_NOT_FOUND);
    }

    /** F04 R26 — a record pointing at a missing file is not a broken page */
    public function testAMissingFileIsReportedAsNoLogo(): void
    {
        $this->uploadLogo($this->makePng());
        unlink($this->currentLogoPath());

        $this->client->request('GET', self::URI);
        self::assertNull($this->decodeResponse()['logoUrl']);

        $this->client->request('GET', '/api/branding/logo');
        self::assertResponseStatusCodeSame(Response::HTTP_NOT_FOUND);
    }

    public function testTheLogoUrlChangesWhenTheLogoIsReplaced(): void
    {
        $this->uploadLogo($this->makePng());
        $first = $this->decodeResponse()['logoUrl'];

        // The cache-busting value is a timestamp, so move the clock on.
        sleep(1);

        $this->uploadLogo($this->makePng());
        $second = $this->decodeResponse()['logoUrl'];

        self::assertNotSame($first, $second, 'A replaced logo must not be served from cache.');
    }

    // ------------------------------------------------------------ helpers

    private function uploadLogo(UploadedFile $file): void
    {
        $this->client->request('POST', self::LOGO_URI, files: ['logo' => $file]);
    }

    private function currentLogoPath(): string
    {
        $this->entityManager->clear();

        $store = $this->entityManager->getRepository(Store::class)->findOneBy([]);
        self::assertInstanceOf(Store::class, $store);

        $filename = $store->getLogoFilename();
        self::assertIsString($filename);

        return static::getContainer()->get(LogoStore::class)->pathFor($filename);
    }

    /**
     * Real image bytes rather than anything generated: GD is not enabled in
     * every PHP build, and the code under test does not need it either —
     * getimagesize is part of PHP's core.
     */
    private const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    private const ONE_PIXEL_JPEG = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

    private function makePng(string $name = 'logo.png'): UploadedFile
    {
        return $this->makeFile($name, (string) base64_decode(self::ONE_PIXEL_PNG, true), 'image/png');
    }

    private function makeJpeg(string $name = 'logo.jpg'): UploadedFile
    {
        return $this->makeFile($name, (string) base64_decode(self::ONE_PIXEL_JPEG, true), 'image/jpeg');
    }

    private function makeFile(string $name, string $contents, string $contentType): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'upload');
        file_put_contents($path, $contents);

        $this->temporaryFiles[] = $path;

        return new UploadedFile($path, $name, $contentType, test: true);
    }
}
