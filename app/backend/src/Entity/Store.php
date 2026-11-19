<?php

declare(strict_types=1);

namespace App\Entity;

use App\Branding\Currency;
use App\Repository\StoreRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * The shop (F27 R1): who is running the promotions, and everything every one
 * of them shows — the company name, the logo, the currency, the language a
 * player page opens in and the clock its day is counted on.
 *
 * Not the theme: F30 moved it to Game, because a theme is the promotion's
 * card rather than the business's identity.
 *
 * This is F04 R1's single branding record, renamed to what it actually is.
 * What a promotion is called, what its phrase is and how often one person
 * may play it went to Game, because a shop types these once and runs many
 * promotions with them (R10, R11).
 */
#[ORM\Entity(repositoryClass: StoreRepository::class)]
#[ORM\Table(name: 'store')]
class Store
{
    public const NAME_MAX_LENGTH = 60;

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(name: 'company_name', length: self::NAME_MAX_LENGTH, nullable: true)]
    private ?string $companyName = null;

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

    /**
     * The language a player page opens in (F27 R17), ahead of the browser's
     * preference (F12 R3). Null keeps today's behaviour exactly: the browser
     * decides. A player's own choice still wins either way (F12 R7).
     */
    #[ORM\Column(length: 2, nullable: true)]
    private ?string $language = null;

    /**
     * Where the shop is, which is what decides when its day rolls over
     * (F27 R15, amending F23 R7's deployment setting).
     *
     * The column cannot be null, because every daily count depends on it and
     * a null would have to be guessed at somewhere. The property's initial
     * value exists so a fresh row is constructible, not as a default offered
     * to an admin: the Store form requires an explicit choice, and the
     * upgrade seeds existing installations from APP_TIMEZONE (R34).
     */
    #[ORM\Column(length: 64, options: ['default' => 'UTC'])]
    private string $timezone = 'UTC';

    /**
     * F32 R5, R6. What a customer typically spends, in the store's
     * currency.
     *
     * It exists for one purpose: a percentage reward is a percentage of
     * *something*, and without this there is nothing to take a percentage
     * of. Null means a percentage cannot be priced, which the stats
     * report as unpriced rather than as free.
     *
     * Deliberately not multiplied by anything else. Customers times the
     * basket would read as revenue brought in, and this database does not
     * know what anybody bought (F32 section 13).
     */
    #[ORM\Column(name: 'average_basket', type: 'integer', nullable: true)]
    private ?int $averageBasket = null;

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
    public function setCompanyName(?string $companyName): void
    {
        $this->companyName = $this->normalise($companyName);
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

    /** F27 R17. Null means no choice has been made and the browser decides. */
    public function getLanguage(): ?string
    {
        return $this->language;
    }

    public function setLanguage(?string $language): void
    {
        $this->language = $this->normalise($language);
        $this->touch();
    }

    /** F27 R15. Never null: see the property. */
    /** F32 R5. Null when nothing has been typed: see the property. */
    public function getAverageBasket(): ?int
    {
        return $this->averageBasket;
    }

    public function setAverageBasket(?int $averageBasket): void
    {
        $this->averageBasket = $averageBasket;
        $this->touch();
    }

    public function getTimezone(): string
    {
        return $this->timezone;
    }

    public function getTimezoneAsZone(): \DateTimeZone
    {
        return new \DateTimeZone($this->timezone);
    }

    /**
     * Refuses an identifier the runtime does not recognise, so a wrong zone
     * is a failed save rather than a limit that resets mid-afternoon
     * (F27 R15, R34 — F23 R8 made this a boot failure instead).
     */
    public function setTimezone(string $timezone): void
    {
        new \DateTimeZone($timezone);

        $this->timezone = $timezone;
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
