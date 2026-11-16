<?php

declare(strict_types=1);

namespace App\Branding;

use App\Entity\Branding;
use Symfony\Component\HttpFoundation\RequestStack;

/**
 * Shapes branding for the API (F04 section 8).
 *
 * The same shape serves the admin and the player: unlike the wheel, there is
 * nothing here a player may not see.
 */
final class BrandingPresenter
{
    public function __construct(
        private readonly LogoStore $logos,
        private readonly RequestStack $requests,
    ) {
    }

    /**
     * @return array{
     *     companyName: string|null,
     *     campaignName: string|null,
     *     tagline: string,
     *     theme: string,
     *     currency: string,
     *     currencySymbol: string,
     *     logoUrl: string|null
     * }
     */
    public function present(Branding $branding): array
    {
        $currency = $branding->currencyOr($this->defaultCurrency());

        return [
            'companyName' => $branding->getCompanyName(),
            'campaignName' => $branding->getCampaignName(),
            // The effective phrase: the admin's, or the default. The player
            // page should never have to know which.
            'tagline' => $branding->getTagline(),
            'theme' => $branding->getTheme()->value,
            // F13 R28: the symbol travels with the code so neither the admin
            // nor the player page has to carry its own table of them.
            // F15 R5: the effective one — the admin's choice, or what this
            // reader's language suggests while there is no choice.
            'currency' => $currency->value,
            'currencySymbol' => $currency->symbol(),
            'logoUrl' => $this->logoUrl($branding),
        ];
    }

    /**
     * What an unchosen campaign falls back to, for whoever is asking
     * (F15 R5).
     *
     * Public because the admin controller reports it in its own right: the
     * selector has to open on something, and "what your language suggests"
     * is the answer F15 R8 gives.
     */
    public function defaultCurrency(): Currency
    {
        return Currency::forLocale($this->requests->getCurrentRequest()?->getLocale() ?? 'en');
    }

    /**
     * Null unless a logo is both recorded and actually on disk, so a missing
     * file renders as no logo rather than as a broken image (F04 R26).
     *
     * The timestamp busts the cache when the logo is replaced; without it a
     * browser would keep showing the old one at the same URL.
     */
    private function logoUrl(Branding $branding): ?string
    {
        $filename = $branding->getLogoFilename();

        if (null === $filename || !$this->logos->exists($filename)) {
            return null;
        }

        return '/api/branding/logo?v='.$branding->getUpdatedAt()->getTimestamp();
    }
}
