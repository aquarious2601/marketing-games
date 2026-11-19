<?php

declare(strict_types=1);

namespace App\Branding;

use App\Entity\Game;
use App\Entity\Store;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Contracts\Translation\TranslatorInterface;

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
        private readonly TranslatorInterface $translator,
    ) {
    }

    /**
     * @return array{
     *     companyName: string|null,
     *     theme: string,
     *     currency: string,
     *     currencySymbol: string,
     *     logoUrl: string|null
     * }
     */
    public function present(Store $store): array
    {
        $currency = $store->currencyOr($this->defaultCurrency());

        return [
            'companyName' => $store->getCompanyName(),
            'theme' => $store->getTheme()->value,
            // F13 R28: the symbol travels with the code so neither the admin
            // nor the player page has to carry its own table of them.
            // F15 R5: the effective one — the admin's choice, or what this
            // reader's language suggests while there is no choice.
            'currency' => $currency->value,
            'currencySymbol' => $currency->symbol(),
            'logoUrl' => $this->logoUrl($store),
        ];
    }

    /**
     * The store's branding with the game's own words in it.
     *
     * The name and the phrase belong to the promotion (F27 R11, R12) and the
     * rest belongs to the shop (R10) — but the player page reads them in one
     * header and has no use for the distinction, so the payload it has always
     * had keeps exactly the shape it had.
     *
     * @return array{
     *     companyName: string|null,
     *     theme: string,
     *     currency: string,
     *     currencySymbol: string,
     *     logoUrl: string|null,
     *     campaignName: string,
     *     tagline: string
     * }
     */
    public function presentForGame(Store $store, Game $game): array
    {
        return [
            ...$this->present($store),
            'campaignName' => $game->getName(),
            // F12 R11: the admin's phrase as they typed it, or ours
            // translated. The page should never have to know which.
            'tagline' => $game->getOwnTagline() ?? $this->translator->trans($game->defaultTaglineKey()),
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
    private function logoUrl(Store $store): ?string
    {
        $filename = $store->getLogoFilename();

        if (null === $filename || !$this->logos->exists($filename)) {
            return null;
        }

        return '/api/branding/logo?v='.$store->getUpdatedAt()->getTimestamp();
    }
}
