<?php

declare(strict_types=1);

namespace App\Tests\Controller\Admin;

use App\Tests\Support\DatabaseWebTestCase;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpFoundation\Response;

/**
 * F15: choosing the currency, through the kernel.
 *
 * Separate from BrandingControllerTest because what is under test is the
 * interaction between the stored choice and the reader's language, and
 * every case here needs a different `Accept-Language`.
 */
final class CurrencyChoiceTest extends DatabaseWebTestCase
{
    private const URI = '/api/admin/branding';

    /** F15 R2, R8: the selector opens on what the language suggests. */
    #[DataProvider('languagesAndTheirCurrencies')]
    public function testAnUnchosenCampaignReadsInTheAdminsCurrency(
        string $language,
        string $currency,
        string $symbol,
    ): void {
        $this->signInAsAdmin();

        $this->get($language);

        $body = $this->decodeResponse();

        self::assertNull($body['ownCurrency'], 'nobody has chosen');
        self::assertSame($currency, $body['defaultCurrency']);
        self::assertSame($currency, $body['currency'], 'so the effective one is the default');
        self::assertSame($symbol, $body['currencySymbol']);
    }

    /** @return iterable<string, array{string, string, string}> */
    public static function languagesAndTheirCurrencies(): iterable
    {
        yield 'english' => ['en', 'USD', '$'];
        yield 'french' => ['fr', 'EUR', '€'];
        yield 'vietnamese' => ['vi', 'VND', '₫'];
        yield 'chinese' => ['zh', 'CNY', '¥'];
    }

    /**
     * F15 R12, and the reason the whole feature is shaped this way: if the
     * language could move a *chosen* currency, an admin reading a
     * Vietnamese campaign in French would turn ₫50,000 into €50,000 by
     * doing nothing at all. See F15 section 13.
     */
    public function testTheLanguageNeverMovesACurrencyThatWasChosen(): void
    {
        $this->signInAsAdmin();
        $this->save(['currency' => 'VND']);

        $this->get('fr');

        $body = $this->decodeResponse();

        self::assertSame('VND', $body['ownCurrency']);
        self::assertSame('VND', $body['currency']);
        self::assertSame('EUR', $body['defaultCurrency'], 'the suggestion still reads French');
    }

    /** F15 R6: the list is the server's, so no page carries its own. */
    public function testItOffersEveryCurrencyWithItsSymbol(): void
    {
        $this->signInAsAdmin();
        $this->get('en');

        $currencies = $this->decodeResponse()['currencies'];

        self::assertSame(
            ['VND', 'EUR', 'USD', 'GBP', 'CNY'],
            array_column($currencies, 'value'),
        );
        self::assertSame('¥', array_column($currencies, 'symbol', 'value')['CNY']);
    }

    /** F15 R10 */
    public function testSavingTheBrandingChoosesTheCurrency(): void
    {
        $this->signInAsAdmin();
        $this->save(['currency' => 'CNY']);

        self::assertResponseIsSuccessful();
        self::assertSame('CNY', $this->decodeResponse()['currency']);

        $this->get('en');
        self::assertSame('CNY', $this->decodeResponse()['ownCurrency']);
    }

    /**
     * F13 R27, unchanged by F15: a client that does not send the field
     * cannot reset a shop's currency by saving its company name.
     */
    public function testSavingWithoutACurrencyLeavesItAlone(): void
    {
        $this->signInAsAdmin();
        $this->save(['currency' => 'GBP']);

        $this->save(['companyName' => 'Korean Cosmetics']);

        self::assertResponseIsSuccessful();
        self::assertSame('GBP', $this->decodeResponse()['currency']);
    }

    public function testItRefusesACurrencyItDoesNotHave(): void
    {
        $this->signInAsAdmin();
        $this->save(['currency' => 'XAU']);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame(
            'currency',
            $this->decodeResponse()['error']['violations'][0]['field'],
        );
    }

    /**
     * F15 R6: there is nothing here for a player to decide, so the player
     * is sent the effective currency and neither of the admin's fields.
     */
    public function testThePlayerIsSentNoChoice(): void
    {
        $this->client->request('GET', '/api/wheel', server: ['HTTP_ACCEPT_LANGUAGE' => 'fr']);

        $branding = $this->decodeResponse()['branding'];

        self::assertSame('EUR', $branding['currency']);
        self::assertArrayNotHasKey('ownCurrency', $branding);
        self::assertArrayNotHasKey('defaultCurrency', $branding);
        self::assertArrayNotHasKey('currencies', $branding);
    }

    private function get(string $language): void
    {
        $this->client->request('GET', self::URI, server: [
            'HTTP_ACCEPT_LANGUAGE' => $language,
        ]);
    }

    /**
     * @param array<string, mixed> $changes
     */
    private function save(array $changes): void
    {
        $this->put(self::URI, [
            'companyName' => '',
            'campaignName' => '',
            'tagline' => '',
            'theme' => 'plain',
            ...$changes,
        ]);
    }
}
