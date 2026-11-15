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

    /**
     * Vietnam, because that is where the first campaign is and because a
     * default has to be something. The admin changes it beside the company
     * name, and nothing in the game depends on which it is.
     */
    public const DEFAULT = 'VND';

    /** Forgiving on the way out, strict on the way in — as Theme is. */
    public static function fromStorage(?string $value): self
    {
        return self::tryFrom((string) $value) ?? self::VND;
    }

    public function symbol(): string
    {
        return match ($this) {
            self::VND => '₫',
            self::EUR => '€',
            self::USD => '$',
            self::GBP => '£',
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
            self::USD, self::GBP, self::EUR => true,
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
