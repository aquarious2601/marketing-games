<?php

declare(strict_types=1);

namespace App\Entity;

use App\Branding\Currency;
use App\Branding\Theme;
use App\Repository\BrandingRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * The single branding record (F04 R1): who is running the promotion, what it
 * is called, what it looks like.
 *
 * Kept apart from Wheel so that saving the prize list and saving the
 * branding cannot discard each other (F04 R5).
 */
#[ORM\Entity(repositoryClass: BrandingRepository::class)]
#[ORM\Table(name: 'branding')]
class Branding
{
    public const NAME_MAX_LENGTH = 60;

    /** A sentence rather than a name, so it gets more room. */
    public const TAGLINE_MAX_LENGTH = 120;

    /** Shown when the admin has not set one of their own (F04 R28). */
    public const DEFAULT_TAGLINE = 'One spin, one prize. Good luck.';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(name: 'company_name', length: self::NAME_MAX_LENGTH, nullable: true)]
    private ?string $companyName = null;

    #[ORM\Column(name: 'campaign_name', length: self::NAME_MAX_LENGTH, nullable: true)]
    private ?string $campaignName = null;

    #[ORM\Column(length: self::TAGLINE_MAX_LENGTH, nullable: true)]
    private ?string $tagline = null;

    #[ORM\Column(length: 20, options: ['default' => 'plain'])]
    private string $theme = Theme::Plain->value;

    #[ORM\Column(name: 'logo_filename', length: 80, nullable: true)]
    private ?string $logoFilename = null;

    #[ORM\Column(name: 'logo_content_type', length: 40, nullable: true)]
    private ?string $logoContentType = null;

    /**
     * F13 R27: one currency per campaign. A shop trades in one, and
     * per-reward currency would allow a wheel offering €5 off and ₫50,000
     * off at once — not a campaign anybody runs, and a bug nobody catches.
     *
     * Null means nobody has chosen one (F15 R4), exactly as a null tagline
     * means nobody has written one. What an unchosen campaign *shows* is
     * decided per request from the reader's language, which is why the
     * fallback is not stored here — see BrandingPresenter and F15 R5.
     */
    #[ORM\Column(length: 3, nullable: true)]
    private ?string $currency = null;

    #[ORM\Column(name: 'updated_at')]
    private \DateTimeImmutable $updatedAt;

    public function __construct()
    {
        $this->updatedAt = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getCompanyName(): ?string
    {
        return $this->companyName;
    }

    public function getCampaignName(): ?string
    {
        return $this->campaignName;
    }

    /**
     * The admin's phrase, or the default when they have not set one. Never
     * null, so the page always has something to show.
     */
    public function getTagline(): string
    {
        return $this->tagline ?? self::DEFAULT_TAGLINE;
    }

    /** Null when the default is in use, which is what the admin form needs. */
    public function getOwnTagline(): ?string
    {
        return $this->tagline;
    }

    /** F04 R8: never hands back something the frontend cannot render. */
    public function getTheme(): Theme
    {
        return Theme::fromStored($this->theme);
    }

    public function getLogoFilename(): ?string
    {
        return $this->logoFilename;
    }

    public function getLogoContentType(): ?string
    {
        return $this->logoContentType;
    }

    public function hasLogo(): bool
    {
        return null !== $this->logoFilename;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    /** Empty strings are stored as null, so "unset" has one representation. */
    public function setNames(?string $companyName, ?string $campaignName): void
    {
        $this->companyName = $this->normalise($companyName);
        $this->campaignName = $this->normalise($campaignName);
        $this->touch();
    }

    public function setTagline(?string $tagline): void
    {
        $this->tagline = $this->normalise($tagline);
        $this->touch();
    }

    public function setTheme(Theme $theme): void
    {
        $this->theme = $theme->value;
        $this->touch();
    }

    public function setLogo(string $filename, string $contentType): void
    {
        $this->logoFilename = $filename;
        $this->logoContentType = $contentType;
        $this->touch();
    }

    public function clearLogo(): void
    {
        $this->logoFilename = null;
        $this->logoContentType = null;
        $this->touch();
    }

    /**
     * The currency the admin chose, or null if none has been (F15 R4).
     *
     * There is deliberately no `getCurrency()` returning a non-null
     * Currency. A caller that wants one has to say what to fall back to,
     * and the only honest answer depends on who is asking — which is a
     * question an entity cannot answer. `currencyOr()` makes the caller
     * supply it.
     */
    public function getOwnCurrency(): ?Currency
    {
        return null === $this->currency ? null : Currency::fromStorage($this->currency);
    }

    /** F15 R5: the chosen currency, or the given fallback. */
    public function currencyOr(Currency $fallback): Currency
    {
        return $this->getOwnCurrency() ?? $fallback;
    }

    public function setCurrency(?Currency $currency): void
    {
        $this->currency = $currency?->value;
        $this->touch();
    }

    private function touch(): void
    {
        $this->updatedAt = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
    }

    private function normalise(?string $value): ?string
    {
        $trimmed = trim((string) $value);

        return '' === $trimmed ? null : $trimmed;
    }
}
