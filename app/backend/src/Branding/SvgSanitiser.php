<?php

declare(strict_types=1);

namespace App\Branding;

use enshrined\svgSanitize\Sanitizer;

/**
 * Makes an uploaded SVG safe to serve (F05 R5–R11).
 *
 * The actual removal is done by enshrined/svg-sanitize, deliberately: the
 * ways to get script into an SVG run from the obvious `<script>` through
 * every `on*` attribute, `javascript:` in href and xlink:href,
 * `<foreignObject>`, `<use>` pointing at a remote document, CSS `url()` and
 * namespace tricks. That belongs in a maintained project, not here.
 *
 * What this class adds is the decisions around it: what is refused outright
 * rather than cleaned, and what the admin is told afterwards.
 */
final class SvgSanitiser
{
    /**
     * Markers looked for in the original purely so the notice can name what
     * went (F05 R10). They do not decide anything — the sanitiser does the
     * removing, and the final answer to "was it changed" is a comparison of
     * before and after.
     *
     * @var array<string, string> description => pattern
     */
    private const MARKERS = [
        'scripts' => '/<\s*script[\s>]/i',
        'event handlers' => '/\son[a-z]+\s*=/i',
        'javascript: links' => '/javascript\s*:/i',
        'embedded objects' => '/<\s*(foreignObject|iframe|embed|object)[\s>]/i',
        'remote references' => '/(?:href|src)\s*=\s*["\']?\s*(?:https?:)?\/\//i',
    ];

    public function __construct(
        private readonly Sanitizer $sanitizer,
    ) {
    }

    /**
     * @return array{svg: string, removed: list<string>}
     *
     * @throws LogoRejected
     */
    public function clean(string $svg): array
    {
        $this->refuseEntities($svg);

        // F05 R7: a logo must not call out to another server when a player
        // opens the page.
        $this->sanitizer->removeRemoteReferences(true);

        $clean = $this->sanitizer->sanitize($svg);

        // F05 R8. The library returns false when the document will not parse
        // at all, which is the one case where there is nothing to salvage.
        if (false === $clean || '' === trim($clean)) {
            throw new LogoRejected('logo.svg_unreadable', [], 'That SVG could not be read.');
        }

        return [
            'svg' => $clean,
            'removed' => $this->describeWhatWent($svg, $clean),
        ];
    }

    /**
     * Does this look like an SVG at all (F05 R2)? Decided by reading the
     * file, never by its name or the content type the browser declared.
     */
    public static function looksLikeSvg(string $contents): bool
    {
        $head = ltrim(substr($contents, 0, 1024));

        return 1 === preg_match('/^<\s*(\?xml|!DOCTYPE\s+svg|svg[\s>])/i', $head);
    }

    /**
     * F05 R9. An entity declaration is not untidiness, it is the start of a
     * billion-laughs expansion or an attempt at reading local files. There
     * is no legitimate logo that needs one, so this is refused before any
     * parser is handed the document.
     *
     * @throws LogoRejected
     */
    private function refuseEntities(string $svg): void
    {
        if (1 === preg_match('/<!ENTITY/i', $svg)) {
            throw new LogoRejected(
                'logo.svg_entities',
                [],
                'That SVG declares XML entities.',
            );
        }
    }

    /**
     * @return list<string>
     */
    private function describeWhatWent(string $before, string $after): array
    {
        if ($this->sameIgnoringFormatting($before, $after)) {
            return [];
        }

        $removed = [];

        foreach (self::MARKERS as $description => $pattern) {
            if (1 === preg_match($pattern, $before) && 1 !== preg_match($pattern, $after)) {
                $removed[] = $description;
            }
        }

        // Changed, but not by anything recognised — editor metadata, unused
        // definitions, and so on. Still worth saying something happened.
        return [] === $removed ? ['unsupported markup'] : $removed;
    }

    /**
     * The sanitiser reformats even when it takes nothing out: it adds an XML
     * declaration, indents the document, and expands `<circle/>` into
     * `<circle></circle>`. Comparing raw strings would therefore report a
     * removal on every upload, and a notice that appears every time tells
     * the admin nothing.
     */
    private function sameIgnoringFormatting(string $a, string $b): bool
    {
        return $this->normalise($a) === $this->normalise($b);
    }

    /**
     * Flattens both forms of an empty element to the same thing, drops the
     * XML declaration and all whitespace. Crude on purpose: this decides
     * what the admin is told, never what is served.
     */
    private function normalise(string $svg): string
    {
        $result = preg_replace('/<\?xml.*?\?>/is', '', $svg) ?? $svg;
        $result = preg_replace('#</[a-z0-9:_-]+\s*>#i', '', $result) ?? $result;
        $result = preg_replace('#\s*/>#', '>', $result) ?? $result;
        $result = preg_replace('/\s+/', '', $result) ?? $result;

        return strtolower($result);
    }
}
