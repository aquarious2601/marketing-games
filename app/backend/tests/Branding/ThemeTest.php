<?php

declare(strict_types=1);

namespace App\Tests\Branding;

use App\Branding\Theme;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ThemeTest extends TestCase
{
    /** F04 R7, amended 2026-11-15 to add Birthday and 2026-11-20 to add Custom (F35 R1) */
    public function testTheThemesAreExactlyThese(): void
    {
        self::assertSame(
            ['plain', 'black-friday', 'christmas', 'new-year', 'halloween', 'birthday', 'custom'],
            array_map(static fn (Theme $t): string => $t->value, Theme::cases()),
        );
    }

    /** F35 R2. The looks with colours of their own: every case but Custom. */
    public function testOnlyTheSixCanBeBorrowedFrom(): void
    {
        self::assertSame(
            ['plain', 'black-friday', 'christmas', 'new-year', 'halloween', 'birthday'],
            array_map(static fn (Theme $t): string => $t->value, Theme::bases()),
        );
    }

    /**
     * F35 R2. A custom theme borrowing itself has no colours at the end of
     * it, so a stored base of `custom` is read the way any other value the
     * page cannot paint is read (F04 R8).
     */
    public function testACustomBaseReadsAsPlain(): void
    {
        self::assertSame(Theme::Plain, Theme::baseFromStored('custom'));
        self::assertSame(Theme::Plain, Theme::baseFromStored('tombola'));
        self::assertSame(Theme::Plain, Theme::baseFromStored(null));
        self::assertSame(Theme::Birthday, Theme::baseFromStored('birthday'));
    }

    public function testEveryThemeHasAReadableLabel(): void
    {
        foreach (Theme::cases() as $theme) {
            self::assertNotSame('', $theme->label());
            self::assertStringNotContainsString('-', $theme->label());
        }

        self::assertSame('Happy Birthday', Theme::Birthday->label());
    }

    /**
     * F04 R8. A value from an older release, or one edited into the
     * database, must render the page rather than break it.
     */
    #[DataProvider('unrecognisedValues')]
    public function testAnUnrecognisedStoredValueFallsBackToPlain(?string $stored): void
    {
        self::assertSame(Theme::Plain, Theme::fromStored($stored));
    }

    /**
     * @return iterable<string, array{string|null}>
     */
    public static function unrecognisedValues(): iterable
    {
        yield 'null' => [null];
        yield 'empty' => [''];
        yield 'a theme that never existed' => ['easter'];
        yield 'wrong case' => ['Christmas'];
        yield 'nonsense' => ['../../etc/passwd'];
    }

    public function testAStoredValueThatIsRecognisedIsKept(): void
    {
        self::assertSame(Theme::Halloween, Theme::fromStored('halloween'));
    }

    public function testAllListsEveryThemeForTheAdminSelector(): void
    {
        $all = Theme::all();

        self::assertCount(\count(Theme::cases()), $all);
        self::assertSame(['value' => 'plain', 'label' => 'Plain'], $all[0]);
        self::assertSame(['value' => 'black-friday', 'label' => 'Black Friday'], $all[1]);
    }
}
