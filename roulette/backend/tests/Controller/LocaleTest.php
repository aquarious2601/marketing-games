<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Tests\Support\DatabaseWebTestCase;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpFoundation\Response;

/**
 * F12 R3, R4, R8, R16: the API answers in the caller's language.
 *
 * Driven through real requests rather than through the translator directly,
 * because what is under test is the negotiation — that `Accept-Language`
 * reaches the translator at all, and that an unsupported one falls back
 * instead of half-translating.
 */
final class LocaleTest extends DatabaseWebTestCase
{
    private const SPIN_URI = '/api/spin';
    private const IDENTIFY_URI = '/api/player/identify';

    /**
     * F12 R8, R16. The refusal from F08 R16 is the message a player is most
     * likely to see, so it is the one worth checking in every language.
     *
     * @param non-empty-string $expected
     */
    #[DataProvider('refusals')]
    public function testItRefusesASpinInTheCallersLanguage(string $acceptLanguage, string $expected): void
    {
        $this->client->request('POST', self::SPIN_URI, server: [
            'HTTP_ACCEPT_LANGUAGE' => $acceptLanguage,
        ]);

        self::assertResponseStatusCodeSame(Response::HTTP_FORBIDDEN);
        self::assertStringContainsString($expected, $this->decodeResponse()['error']['message']);
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function refusals(): iterable
    {
        yield 'english' => ['en', 'who you are'];
        yield 'french' => ['fr', 'qui vous êtes'];
        yield 'vietnamese' => ['vi', 'bạn là ai'];
        yield 'chinese' => ['zh', '您是谁'];
    }

    /** F12 R4: a regional tag is its language. */
    #[DataProvider('regionalTags')]
    public function testARegionalTagIsItsLanguage(string $acceptLanguage, string $expected): void
    {
        $this->client->request('POST', self::SPIN_URI, server: [
            'HTTP_ACCEPT_LANGUAGE' => $acceptLanguage,
        ]);

        self::assertStringContainsString($expected, $this->decodeResponse()['error']['message']);
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function regionalTags(): iterable
    {
        yield 'fr-CA is French' => ['fr-CA', 'qui vous êtes'];
        yield 'zh-TW is Chinese' => ['zh-TW', '您是谁'];
        yield 'en-GB is English' => ['en-GB', 'who you are'];
    }

    /**
     * F12 R3. A language we do not have must produce whole English, not a
     * page with four words of German in it.
     */
    public function testAnUnsupportedLanguageFallsBackToEnglish(): void
    {
        $this->client->request('POST', self::SPIN_URI, server: [
            'HTTP_ACCEPT_LANGUAGE' => 'de-DE,de;q=0.9',
        ]);

        self::assertStringContainsString('who you are', $this->decodeResponse()['error']['message']);
    }

    public function testNoHeaderAtAllIsEnglish(): void
    {
        $this->client->request('POST', self::SPIN_URI);

        self::assertStringContainsString('who you are', $this->decodeResponse()['error']['message']);
    }

    /** The quality values are honoured, not just the first tag. */
    public function testItPrefersTheHighestQualityLanguageItHas(): void
    {
        $this->client->request('POST', self::SPIN_URI, server: [
            'HTTP_ACCEPT_LANGUAGE' => 'de;q=0.9,vi;q=0.8',
        ]);

        self::assertStringContainsString(
            'bạn là ai',
            $this->decodeResponse()['error']['message'],
            'German is not offered, so the Vietnamese should have won.',
        );
    }

    /** F12 R16 — validation violations are translated too, not just refusals */
    public function testValidationViolationsAreTranslated(): void
    {
        $this->client->request(
            'POST',
            self::IDENTIFY_URI,
            server: ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT_LANGUAGE' => 'fr'],
            content: json_encode(['phone' => '12'], \JSON_THROW_ON_ERROR),
        );

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);

        $error = $this->decodeResponse()['error'];

        self::assertStringContainsString('informations', $error['message']);
        self::assertStringContainsString('numéro de téléphone', $error['violations'][0]['message']);
    }

    /**
     * F12 section 8: `field` is an identifier the client matches on to put
     * each message against its input. Translating it would break the form.
     */
    public function testTheFieldNameIsNeverTranslated(): void
    {
        $this->client->request(
            'POST',
            self::IDENTIFY_URI,
            server: ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT_LANGUAGE' => 'vi'],
            content: json_encode(['phone' => '12'], \JSON_THROW_ON_ERROR),
        );

        self::assertSame('phone', $this->decodeResponse()['error']['violations'][0]['field']);
    }

    /** F12 R12: a translation changes the words and nothing else. */
    public function testTheGameItselfIsIdenticalInEveryLanguage(): void
    {
        $prizes = [];

        foreach (['en', 'fr', 'zh', 'vi'] as $language) {
            $this->client->request('GET', '/api/wheel', server: [
                'HTTP_ACCEPT_LANGUAGE' => $language,
            ]);

            self::assertResponseIsSuccessful();
            $prizes[$language] = array_column($this->decodeResponse()['prizes'], 'name');
        }

        self::assertSame($prizes['en'], $prizes['fr']);
        self::assertSame($prizes['en'], $prizes['zh']);
        self::assertSame($prizes['en'], $prizes['vi']);
    }

    /**
     * F12 R10. The sharpest edge of the "content is not translated"
     * decision: a prize the admin named stays exactly as they named it,
     * whatever language the page is in.
     */
    public function testAPrizeNameIsNeverTranslated(): void
    {
        $this->signInAsAdmin();

        $this->put('/api/admin/wheel', [
            'prizes' => [
                ['name' => 'Free sample', 'probability' => 50, 'rewardId' => $this->aRewardId()],
                ['name' => 'Try again', 'probability' => 50, 'rewardId' => $this->aRewardId()],
            ],
        ]);
        self::assertResponseIsSuccessful();

        $this->client->request('GET', '/api/wheel', server: ['HTTP_ACCEPT_LANGUAGE' => 'vi']);

        self::assertSame(
            ['Free sample', 'Try again'],
            array_column($this->decodeResponse()['prizes'], 'name'),
        );
    }

    /**
     * F12 R11. The opposite case, and the reason the two are worth stating
     * as separate rules: the default tagline is the application's own words,
     * so it *is* translated.
     */
    public function testTheDefaultTaglineIsTranslated(): void
    {
        $this->signInAsAdmin();

        $this->client->request('GET', '/api/admin/branding', server: [
            'HTTP_ACCEPT_LANGUAGE' => 'fr',
        ]);

        self::assertResponseIsSuccessful();
        self::assertSame('Un tour, un lot. Bonne chance !', $this->decodeResponse()['defaultTagline']);
    }

    /** F12 R9 — the theme names the admin picks from */
    public function testThemeNamesAreTranslated(): void
    {
        $this->signInAsAdmin();

        $this->client->request('GET', '/api/admin/branding', server: [
            'HTTP_ACCEPT_LANGUAGE' => 'fr',
        ]);

        $labels = array_column($this->decodeResponse()['themes'], 'label', 'value');

        self::assertSame('Noël', $labels['christmas']);
        self::assertSame('Nouvel An', $labels['new-year']);
    }
}
