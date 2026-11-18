<?php

declare(strict_types=1);

namespace App\Tests\Controller\Admin;

use App\Branding\LogoStore;
use App\Entity\Branding;
use App\Tests\Support\DatabaseWebTestCase;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\Response;

/**
 * F04 through the kernel, the database and the filesystem.
 */
final class BrandingControllerTest extends DatabaseWebTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // F07 R17: these routes need a session now.
        $this->signInAsAdmin();
    }

    private const URI = '/api/admin/branding';
    private const LOGO_URI = '/api/admin/branding/logo';

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

        $branding = $this->decodeResponse();

        self::assertNull($branding['companyName']);
        self::assertNull($branding['campaignName']);
        self::assertSame('plain', $branding['theme']);
        self::assertNull($branding['logoUrl']);
    }

    /** F04 R7 */
    public function testItOffersExactlyTheseThemes(): void
    {
        $this->client->request('GET', self::URI);

        $values = array_column($this->decodeResponse()['themes'], 'value');

        self::assertSame(
            ['plain', 'black-friday', 'christmas', 'new-year', 'halloween', 'birthday'],
            $values,
        );
    }

    // ------------------------------------------------------------- saving

    public function testItSavesTheNamesAndTheTheme(): void
    {
        $this->put(self::URI, [
            'companyName' => 'AA Store',
            'campaignName' => 'Black Friday Giveaway',
            'theme' => 'black-friday',
        ]);

        self::assertResponseIsSuccessful();

        $this->client->request('GET', self::URI);
        $branding = $this->decodeResponse();

        self::assertSame('AA Store', $branding['companyName']);
        self::assertSame('Black Friday Giveaway', $branding['campaignName']);
        self::assertSame('black-friday', $branding['theme']);
    }

    /** F04 R2, R3 — trimmed, and empty means unset */
    public function testItTrimsNamesAndStoresBlanksAsUnset(): void
    {
        $this->put(self::URI, [
            'companyName' => '   AA Store   ',
            'campaignName' => '    ',
            'theme' => 'plain',
        ]);

        self::assertResponseIsSuccessful();

        $branding = $this->decodeResponse();
        self::assertSame('AA Store', $branding['companyName']);
        self::assertNull($branding['campaignName']);
    }

    /** F04 R4 */
    public function testItAcceptsBrandingWithNoNamesAtAll(): void
    {
        $this->put(self::URI, ['theme' => 'christmas']);

        self::assertResponseIsSuccessful();
        self::assertNull($this->decodeResponse()['companyName']);
        self::assertSame('christmas', $this->decodeResponse()['theme']);
    }

    // ------------------------------------------------------------ tagline

    /** F04 R28 */
    public function testTheDefaultTaglineIsUsedUntilTheAdminSetsOne(): void
    {
        $this->client->request('GET', self::URI);
        $branding = $this->decodeResponse();

        self::assertSame('One spin, one prize. Good luck.', $branding['tagline']);
        self::assertNull($branding['ownTagline'], 'The admin has not chosen one.');
        self::assertSame('One spin, one prize. Good luck.', $branding['defaultTagline']);
    }

    public function testItSavesATagline(): void
    {
        $this->put(self::URI, ['tagline' => 'Spin for a treat!', 'theme' => 'halloween']);

        self::assertResponseIsSuccessful();

        $this->client->request('GET', self::URI);
        $branding = $this->decodeResponse();

        self::assertSame('Spin for a treat!', $branding['tagline']);
        self::assertSame('Spin for a treat!', $branding['ownTagline']);
    }

    public function testClearingTheTaglineReturnsToTheDefault(): void
    {
        $this->put(self::URI, ['tagline' => 'Spin for a treat!', 'theme' => 'plain']);
        $this->put(self::URI, ['tagline' => '   ', 'theme' => 'plain']);

        self::assertResponseIsSuccessful();

        $this->client->request('GET', self::URI);
        $branding = $this->decodeResponse();

        self::assertNull($branding['ownTagline']);
        self::assertSame('One spin, one prize. Good luck.', $branding['tagline']);
    }

    public function testItTrimsTheTagline(): void
    {
        $this->put(self::URI, ['tagline' => '  Spin for a treat!  ', 'theme' => 'plain']);

        self::assertSame('Spin for a treat!', $this->decodeResponse()['tagline']);
    }

    public function testItRejectsATaglineOver120Characters(): void
    {
        $this->put(self::URI, ['tagline' => str_repeat('a', 121), 'theme' => 'plain']);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('tagline', $this->decodeResponse()['error']['violations'][0]['field']);
    }

    public function testItAcceptsATaglineOfExactly120Characters(): void
    {
        $this->put(self::URI, ['tagline' => str_repeat('a', 120), 'theme' => 'plain']);

        self::assertResponseIsSuccessful();
    }

    /** The tagline reaches the player, who needs no admin request to get it. */
    public function testTheTaglineReachesThePlayer(): void
    {
        $this->put(self::URI, ['tagline' => 'Spin for a treat!', 'theme' => 'plain']);

        $this->client->request('GET', '/api/wheel');

        self::assertSame('Spin for a treat!', $this->decodeResponse()['branding']['tagline']);
    }

        /** F04 R12 */
    // ------------------------------------------- F23: spins per day

    /** F23 R1: a campaign arrives with no limit, as every campaign has. */
    public function testACampaignStartsWithNoDailySpinLimit(): void
    {
        $this->client->request('GET', self::URI);

        self::assertNull($this->decodeResponse()['dailySpinLimit']);
    }

    /** F23 R20 */
    public function testItSavesADailySpinLimit(): void
    {
        $this->put(self::URI, ['dailySpinLimit' => 3]);

        self::assertResponseIsSuccessful();

        $this->client->request('GET', self::URI);
        self::assertSame(3, $this->decodeResponse()['dailySpinLimit']);
    }

    /** What a number input actually posts when somebody types in it. */
    public function testItAcceptsTheLimitAsAString(): void
    {
        $this->put(self::URI, ['dailySpinLimit' => '5']);

        self::assertResponseIsSuccessful();

        $this->client->request('GET', self::URI);
        self::assertSame(5, $this->decodeResponse()['dailySpinLimit']);
    }

    /** F23 R1: and what it posts when somebody clears it. */
    public function testAnEmptyStringClearsTheLimit(): void
    {
        $this->put(self::URI, ['dailySpinLimit' => 4]);
        $this->put(self::URI, ['dailySpinLimit' => '']);

        self::assertResponseIsSuccessful();

        $this->client->request('GET', self::URI);
        self::assertNull($this->decodeResponse()['dailySpinLimit']);
    }

    public function testNullClearsTheLimit(): void
    {
        $this->put(self::URI, ['dailySpinLimit' => 4]);
        $this->put(self::URI, ['dailySpinLimit' => null]);

        $this->client->request('GET', self::URI);
        self::assertNull($this->decodeResponse()['dailySpinLimit']);
    }

    /**
     * F23 R1. The same rule the currency has (F13 R27), and for a sharper
     * reason: without it, the first save from any client that predates this
     * field would quietly unlimit the campaign.
     */
    public function testOmittingTheLimitLeavesItAlone(): void
    {
        $this->put(self::URI, ['dailySpinLimit' => 7]);
        $this->put(self::URI, ['campaignName' => 'Spring']);

        $this->client->request('GET', self::URI);
        self::assertSame(7, $this->decodeResponse()['dailySpinLimit']);
    }

    /**
     * F23 R4. Zero is a mistake in a number field, not an instruction to
     * close the campaign.
     */
    public function testItRejectsALimitOfZero(): void
    {
        $this->put(self::URI, ['dailySpinLimit' => 4]);
        $this->put(self::URI, ['dailySpinLimit' => 0]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('dailySpinLimit', $this->decodeResponse()['error']['violations'][0]['field']);

        $this->client->request('GET', self::URI);
        self::assertSame(4, $this->decodeResponse()['dailySpinLimit'], 'Nothing should have been stored.');
    }

    /** F23 R4: and the ceiling that keeps the column a SMALLINT. */
    public function testItRejectsALimitOverNinetyNine(): void
    {
        $this->put(self::URI, ['dailySpinLimit' => 100]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('dailySpinLimit', $this->decodeResponse()['error']['violations'][0]['field']);
    }

    public function testItAcceptsALimitOfExactlyNinetyNine(): void
    {
        $this->put(self::URI, ['dailySpinLimit' => 99]);

        self::assertResponseIsSuccessful();
    }

    public function testItRejectsALimitThatIsNotANumber(): void
    {
        foreach (['three', '3.5', -1, 2.5, true] as $value) {
            $this->put(self::URI, ['dailySpinLimit' => $value]);

            self::assertResponseStatusCodeSame(
                Response::HTTP_UNPROCESSABLE_ENTITY,
                var_export($value, true).' was accepted as a limit.',
            );
        }
    }

    /** F23 R21: the rest of the section is not saved behind a bad limit. */
    public function testABadLimitSavesNothingElseEither(): void
    {
        $this->put(self::URI, ['campaignName' => 'Spring', 'dailySpinLimit' => 0]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);

        $this->client->request('GET', self::URI);
        self::assertNull($this->decodeResponse()['campaignName']);
    }

    /** F23 R20: the admin form needs the ceiling to validate against. */
    public function testItReportsTheCeiling(): void
    {
        $this->client->request('GET', self::URI);

        self::assertSame(99, $this->decodeResponse()['maxDailySpinLimit']);
    }

    public function testItRejectsAnUnknownTheme(): void
    {
        $this->put(self::URI, ['theme' => 'easter']);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('theme', $this->decodeResponse()['error']['violations'][0]['field']);

        $this->client->request('GET', self::URI);
        self::assertSame('plain', $this->decodeResponse()['theme'], 'Nothing should have been stored.');
    }

    public function testItRejectsANameOverSixtyCharacters(): void
    {
        $this->put(self::URI, ['companyName' => str_repeat('a', 61), 'theme' => 'plain']);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertStringContainsString('60', $this->decodeResponse()['error']['violations'][0]['message']);
    }

    public function testItAcceptsANameOfExactlySixtyCharacters(): void
    {
        $this->put(self::URI, ['companyName' => str_repeat('a', 60), 'theme' => 'plain']);

        self::assertResponseIsSuccessful();
    }

    /** F04 R6 — stored verbatim; escaping is the renderer's job */
    public function testItStoresANameContainingMarkupVerbatim(): void
    {
        $this->put(self::URI, ['companyName' => '<script>alert(1)</script>', 'theme' => 'plain']);

        self::assertResponseIsSuccessful();
        self::assertSame('<script>alert(1)</script>', $this->decodeResponse()['companyName']);
    }

    /** F04 R5 — the two saves must not tread on each other */
    public function testSavingBrandingLeavesThePrizesAlone(): void
    {
        $this->client->request('GET', '/api/admin/wheel');
        $before = array_column($this->decodeResponse()['prizes'], 'name');

        $this->put(self::URI, ['companyName' => 'AA Store', 'theme' => 'halloween']);
        self::assertResponseIsSuccessful();

        $this->client->request('GET', '/api/admin/wheel');
        self::assertSame($before, array_column($this->decodeResponse()['prizes'], 'name'));
    }

    public function testSavingPrizesLeavesTheBrandingAlone(): void
    {
        $this->put(self::URI, ['companyName' => 'AA Store', 'theme' => 'halloween']);

        $this->client->request('GET', '/api/admin/wheel');
        $prizes = array_map(
            static fn (array $p): array => [
                'id' => $p['id'],
                'probability' => $p['probability'],
                'rewardId' => $p['rewardId'],
            ],
            $this->decodeResponse()['prizes'],
        );

        $this->put('/api/admin/wheel', ['prizes' => $prizes]);
        self::assertResponseIsSuccessful();

        $this->client->request('GET', self::URI);
        self::assertSame('AA Store', $this->decodeResponse()['companyName']);
        self::assertSame('halloween', $this->decodeResponse()['theme']);
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

        $branding = $this->entityManager->getRepository(Branding::class)->findOneBy([]);
        self::assertInstanceOf(Branding::class, $branding);

        $filename = (string) $branding->getLogoFilename();
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

        $branding = $this->entityManager->getRepository(Branding::class)->findOneBy([]);
        self::assertInstanceOf(Branding::class, $branding);

        $filename = $branding->getLogoFilename();
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
