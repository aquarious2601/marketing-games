<?php

declare(strict_types=1);

namespace App\Tests\Branding;

use App\Branding\Currency;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class CurrencyTest extends TestCase
{
    /** F13 R27, extended by F15 R1 */
    public function testTheCurrenciesAreExactlyThese(): void
    {
        self::assertSame(
            ['VND', 'EUR', 'USD', 'GBP', 'CNY'],
            array_map(static fn (Currency $c): string => $c->value, Currency::cases()),
        );
    }

    public function testEveryCurrencyHasASymbol(): void
    {
        foreach (Currency::cases() as $currency) {
            self::assertNotSame('', $currency->symbol());
            self::assertNotSame($currency->value, $currency->symbol());
        }
    }

    /** F15 R2 */
    #[DataProvider('languagesAndTheirCurrencies')]
    public function testEachLanguageHasItsCurrency(string $locale, Currency $expected): void
    {
        self::assertSame($expected, Currency::forLocale($locale));
    }

    /** @return iterable<string, array{string, Currency}> */
    public static function languagesAndTheirCurrencies(): iterable
    {
        yield 'English' => ['en', Currency::USD];
        yield 'French' => ['fr', Currency::EUR];
        yield 'Vietnamese' => ['vi', Currency::VND];
        yield 'Chinese' => ['zh', Currency::CNY];
    }

    /**
     * F15 R3. Symfony negotiates a region down to a language before this
     * sees it (F12 R3), but a map that only worked on exactly `fr` would
     * fail silently rather than loudly the day one slipped through.
     */
    #[DataProvider('regionalLanguages')]
    public function testARegionIsReadAsItsLanguage(string $locale): void
    {
        self::assertSame(Currency::EUR, Currency::forLocale($locale));
    }

    /** @return iterable<string, array{string}> */
    public static function regionalLanguages(): iterable
    {
        yield 'hyphen' => ['fr-CA'];
        yield 'underscore' => ['fr_BE'];
        yield 'uppercase' => ['FR'];
    }

    /** F15 R3: a language nobody mapped still gets something usable. */
    public function testAnUnknownLanguageFallsBackToTheDefault(): void
    {
        self::assertSame(Currency::DEFAULT, Currency::forLocale('ja')->value);
        self::assertSame(Currency::DEFAULT, Currency::forLocale('')->value);
    }

    /** F13 R28: the symbol's side of the number is part of the currency. */
    public function testItFormatsAnAmountOnTheRightSide(): void
    {
        self::assertStringStartsWith('¥', Currency::CNY->format(100));
        self::assertStringEndsWith('₫', Currency::VND->format(50000));
    }

    public function testEveryCurrencyIsOffered(): void
    {
        self::assertCount(\count(Currency::cases()), Currency::all());

        foreach (Currency::all() as $option) {
            self::assertArrayHasKey('value', $option);
            self::assertArrayHasKey('symbol', $option);
        }
    }
}
