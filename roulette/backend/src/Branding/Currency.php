<?php

declare(strict_types=1);

namespace App\Branding;

/**
 * What an amount-off reward is counted in (F13 R27).
 *
 * A short closed list rather than free text. A currency is a thing the
 * interface has to render — a symbol, which side of the number it sits on —
 * and free text would mean a shop typing "dong" and the result panel
 * printing "50000 dong" next to a € somewhere else.
 *
 * Four to start with: the two the project was built for (see F08 section 13
 * on the Vietnam/France shape of it) and the two any shop is likeliest to
 * ask for next.
 */
enum Currency: string
{
    case VND = 'VND';
    case EUR = 'EUR';
    case USD = 'USD';
    case GBP = 'GBP';
    case CNY = 'CNY';

    /**
     * The floor under a language nobody has mapped (F15 R3).
     *
     * This was VND, back when every campaign got the same default whatever
     * language it was configured in. F15 replaced that with forLocale(),
     * and all this constant does now is catch a locale the map misses.
     */
    public const DEFAULT = 'USD';

    /**
     * The currency an admin reading in this language most likely means
     * (F15 R2).
     *
     * Keyed on the language alone, never the region: Symfony negotiates
     * `fr-CA` down to `fr` before anything here sees it (F12 R3), and a map
     * with `fr_CA => CAD` in it would be a map that then has to be complete.
     *
     * This decides what an *unchosen* campaign falls back to and nothing
     * else. A currency the admin has chosen is never revisited, because
     * re-deriving it would turn the same 50000 from đồng into euros on a
     * change of dropdown — see F15 section 13.
     */
    public static function forLocale(string $locale): self
    {
        $language = strtolower(explode('_', str_replace('-', '_', $locale))[0]);

        return match ($language) {
            'fr' => self::EUR,
            'vi' => self::VND,
            'zh' => self::CNY,
            'en' => self::USD,
            default => self::from(self::DEFAULT),
        };
    }

    /** Forgiving on the way out, strict on the way in — as Theme is. */
    public static function fromStorage(?string $value): self
    {
        return self::tryFrom((string) $value) ?? self::from(self::DEFAULT);
    }

    public function symbol(): string
    {
        return match ($this) {
            self::VND => '₫',
            self::EUR => '€',
            self::USD => '$',
            self::GBP => '£',
            self::CNY => '¥',
        };
    }

    /**
     * Whether the symbol goes before the number.
     *
     * `$5` and `€5` but `50000₫`. Getting this wrong is the kind of small
     * wrongness that makes a page feel foreign to the person reading it.
     */
    public function symbolLeads(): bool
    {
        return match ($this) {
            self::USD, self::GBP, self::EUR, self::CNY => true,
            self::VND => false,
        };
    }

    public function format(int $amount): string
    {
        // Grouped with thin spaces rather than commas or dots, because which
        // of those means "thousands" depends on the country and a thin space
        // means it everywhere.
        $grouped = number_format($amount, 0, '.', "\u{202F}");

        return $this->symbolLeads() ? $this->symbol().$grouped : $grouped.$this->symbol();
    }

    /**
     * @return list<array{value: string, label: string, symbol: string}>
     */
    public static function all(): array
    {
        return array_map(
            static fn (self $currency): array => [
                'value' => $currency->value,
                // The code is the label: "EUR" needs no translation and is
                // what a shop owner recognises in a dropdown.
                'label' => $currency->value,
                'symbol' => $currency->symbol(),
            ],
            self::cases(),
        );
    }
}
