<?php

declare(strict_types=1);

namespace App\Branding;

/**
 * The looks the game can wear (F04 R7, amended 2026-11-15 to add Birthday).
 *
 * Fixed in code on purpose. Each exists because it is a moment worth running
 * a promotion for; a colour editor instead would mean nobody has checked
 * that the text is readable on the background.
 */
enum Theme: string
{
    case Plain = 'plain';
    case BlackFriday = 'black-friday';
    case Christmas = 'christmas';
    case NewYear = 'new-year';
    case Halloween = 'halloween';
    case Birthday = 'birthday';

    /**
     * F04 R8. A value that is not recognised — an older release's theme, or
     * something edited straight into the database — renders as plain rather
     * than taking the page down.
     */
    public static function fromStored(?string $value): self
    {
        return self::tryFrom((string) $value) ?? self::Plain;
    }

    public function label(): string
    {
        return match ($this) {
            self::Plain => 'Plain',
            self::BlackFriday => 'Black Friday',
            self::Christmas => 'Christmas',
            self::NewYear => 'New Year',
            self::Halloween => 'Halloween',
            self::Birthday => 'Happy Birthday',
        };
    }

    /**
     * The key this theme's name is translated under (F12 R9).
     *
     * Kept here rather than built by the caller so that adding a theme and
     * forgetting its translation is a missing-key failure in
     * TranslationsTest, not a case nobody notices.
     */
    public function labelKey(): string
    {
        return 'theme.'.$this->value;
    }

    /**
     * @return list<array{value: string, label: string}>
     */
    public static function all(): array
    {
        return array_map(
            static fn (self $theme): array => ['value' => $theme->value, 'label' => $theme->label()],
            self::cases(),
        );
    }
}
