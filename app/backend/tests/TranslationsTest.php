<?php

declare(strict_types=1);

namespace App\Tests;

use App\Branding\Theme;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Yaml\Yaml;

/**
 * F12 R14: the four files must stay in step.
 *
 * This is the whole defence against the failure mode four languages
 * introduce. A string added in English and forgotten in Vietnamese becomes a
 * silent English sentence in the middle of a Vietnamese page — it looks like
 * a translation nobody got round to rather than a bug, and nobody notices
 * until a shop does.
 */
final class TranslationsTest extends TestCase
{
    /** F12 R1 */
    private const LANGUAGES = ['en', 'fr', 'zh', 'vi'];

    private const SOURCE = 'en';

    /**
     * @return iterable<string, array{string}>
     */
    public static function otherLanguages(): iterable
    {
        foreach (self::LANGUAGES as $language) {
            if (self::SOURCE !== $language) {
                yield $language => [$language];
            }
        }
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function allLanguages(): iterable
    {
        foreach (self::LANGUAGES as $language) {
            yield $language => [$language];
        }
    }

    #[DataProvider('allLanguages')]
    public function testEveryLanguageHasAFile(string $language): void
    {
        self::assertFileExists(self::pathFor($language));
    }

    /** F12 R14 */
    #[DataProvider('otherLanguages')]
    public function testItHasEveryKeyEnglishHas(string $language): void
    {
        $missing = array_diff(self::keysFor(self::SOURCE), self::keysFor($language));

        self::assertSame(
            [],
            array_values($missing),
            sprintf(
                "messages.%s.yaml is missing keys that English has:\n  %s",
                $language,
                implode("\n  ", $missing),
            ),
        );
    }

    /**
     * F12 R14, the other direction. A key that exists only in French is
     * either a typo or a string that was removed from the code and left
     * behind, and both are worth knowing about.
     */
    #[DataProvider('otherLanguages')]
    public function testItHasNoKeyEnglishDoesNot(string $language): void
    {
        $extra = array_diff(self::keysFor($language), self::keysFor(self::SOURCE));

        self::assertSame(
            [],
            array_values($extra),
            sprintf(
                "messages.%s.yaml has keys English does not:\n  %s",
                $language,
                implode("\n  ", $extra),
            ),
        );
    }

    /** Nothing is "translated" by being left blank. */
    #[DataProvider('allLanguages')]
    public function testNoTranslationIsEmpty(string $language): void
    {
        foreach (self::flatten(self::load($language)) as $key => $value) {
            self::assertNotSame('', trim($value), sprintf('%s is empty in %s.', $key, $language));
        }
    }

    /**
     * A placeholder dropped in translation produces a sentence with a hole
     * in it — "It needs between and digits" — which reads as a bug to the
     * player and is invisible to everyone else.
     */
    #[DataProvider('otherLanguages')]
    public function testEveryPlaceholderSurvivesTranslation(string $language): void
    {
        $source = self::flatten(self::load(self::SOURCE));
        $target = self::flatten(self::load($language));

        foreach ($source as $key => $english) {
            preg_match_all('/%[a-z_]+%/', $english, $matches);
            $expected = $matches[0];

            if ([] === $expected) {
                continue;
            }

            preg_match_all('/%[a-z_]+%/', $target[$key] ?? '', $matches);

            sort($expected);
            $actual = $matches[0];
            sort($actual);

            self::assertSame(
                $expected,
                $actual,
                sprintf('%s in %s does not carry the same placeholders as the English.', $key, $language),
            );
        }
    }

    /**
     * F12 R9. Adding a theme and forgetting to name it is otherwise a raw
     * `theme.easter` on the admin's screen, which is why Theme::labelKey()
     * exists rather than the controller building the key.
     */
    #[DataProvider('allLanguages')]
    public function testEveryThemeIsNamed(string $language): void
    {
        $keys = self::keysFor($language);

        foreach (Theme::cases() as $theme) {
            self::assertContains(
                $theme->labelKey(),
                $keys,
                sprintf('The %s theme has no name in %s.', $theme->value, $language),
            );
        }
    }

    private static function pathFor(string $language): string
    {
        return \dirname(__DIR__).'/translations/messages.'.$language.'.yaml';
    }

    /**
     * @return list<string>
     */
    private static function keysFor(string $language): array
    {
        return array_keys(self::flatten(self::load($language)));
    }

    /**
     * @return array<string, mixed>
     */
    private static function load(string $language): array
    {
        /** @var array<string, mixed> $parsed */
        $parsed = Yaml::parseFile(self::pathFor($language));

        return $parsed;
    }

    /**
     * Symfony flattens nested YAML into dotted ids; this mirrors that, so
     * the keys compared here are the ones the application actually asks for.
     *
     * @param array<string, mixed> $tree
     *
     * @return array<string, string>
     */
    private static function flatten(array $tree, string $prefix = ''): array
    {
        $flat = [];

        foreach ($tree as $key => $value) {
            $id = '' === $prefix ? (string) $key : $prefix.'.'.$key;

            if (\is_array($value)) {
                $flat += self::flatten($value, $id);

                continue;
            }

            $flat[$id] = (string) $value;
        }

        return $flat;
    }
}
