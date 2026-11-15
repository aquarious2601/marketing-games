<?php

declare(strict_types=1);

namespace App\Branding;

use App\Entity\Branding;

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
    ) {
    }

    /**
     * @return array{
     *     companyName: string|null,
     *     campaignName: string|null,
     *     tagline: string,
     *     theme: string,
     *     logoUrl: string|null
     * }
     */
    public function present(Branding $branding): array
    {
        return [
            'companyName' => $branding->getCompanyName(),
            'campaignName' => $branding->getCampaignName(),
            // The effective phrase: the admin's, or the default. The player
            // page should never have to know which.
            'tagline' => $branding->getTagline(),
            'theme' => $branding->getTheme()->value,
            'logoUrl' => $this->logoUrl($branding),
        ];
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
