<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Branding\BrandingPresenter;
use App\Branding\BrandingProvider;
use App\Branding\LogoRejected;
use App\Branding\LogoStore;
use App\Branding\Currency;
use App\Branding\Theme;
use App\Dto\Violation;
use App\Entity\Branding;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * Configuring who is running the promotion and what it looks like.
 *
 * Unauthenticated like the rest of the admin (F01 R15). Note that this one
 * accepts file uploads, which makes the missing authentication a way to fill
 * the disk as well as a way to rewrite the prizes — see F04 section 13.
 */
#[Route('/api/admin/branding', name: 'api_admin_branding_')]
final class BrandingController extends AbstractController
{
    public function __construct(
        private readonly BrandingProvider $provider,
        private readonly BrandingPresenter $presenter,
        private readonly LogoStore $logos,
        private readonly EntityManagerInterface $entityManager,
        private readonly TranslatorInterface $translator,
    ) {
    }

    #[Route('', name: 'show', methods: ['GET'])]
    public function show(): JsonResponse
    {
        $branding = $this->provider->getOrCreate();

        return new JsonResponse([
            ...$this->presenter->present($branding),
            // The admin edits their own value, not the effective one: a
            // pre-filled default would be saved back as if they had chosen
            // it, and they could never return to the default.
            'ownTagline' => $branding->getOwnTagline(),
            // F12 R11: the application's own fallback wording, so it is ours
            // to translate. An admin's own tagline never is.
            'defaultTagline' => $this->translator->trans('tagline.default'),
            // The admin needs the list to build its selector; the player
            // never asks for it.
            // F12 R9: the application's own words for each theme, in the
            // admin's language. What the admin *typed* is never translated.
            'themes' => array_map(
                fn (Theme $theme): array => [
                    'value' => $theme->value,
                    'label' => $this->translator->trans($theme->labelKey()),
                ],
                Theme::cases(),
            ),
            // F13 R27: the codes and their symbols, so the selector needs
            // no table of its own.
            'currencies' => Currency::all(),
            // F15 R6. Same split as the tagline above and for the same
            // reason: the admin edits their own value, and a default shown
            // as if it were theirs is a default they can never get back to.
            'ownCurrency' => $branding->getOwnCurrency()?->value,
            // F15 R2: what this admin's language suggests. Only ever used
            // while nothing has been chosen.
            'defaultCurrency' => $this->presenter->defaultCurrency()->value,
        ]);
    }

    #[Route('', name: 'save', methods: ['PUT'])]
    public function save(Request $request): JsonResponse
    {
        try {
            /** @var mixed $payload */
            $payload = json_decode($request->getContent(), true, flags: \JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return $this->invalid([new Violation('', $this->translator->trans('api.invalid_json'))]);
        }

        if (!\is_array($payload)) {
            return $this->invalid([new Violation('', $this->translator->trans('api.invalid_object'))]);
        }

        $violations = [];

        $companyName = $this->readName($payload, 'companyName', $violations);
        $campaignName = $this->readName($payload, 'campaignName', $violations);
        $tagline = $this->readText($payload, 'tagline', Branding::TAGLINE_MAX_LENGTH, $violations);
        $theme = $this->readTheme($payload, $violations);
        $currency = $this->readCurrency($payload, $violations);

        if ([] !== $violations) {
            return $this->invalid($violations);
        }

        $branding = $this->provider->getOrCreate();
        $branding->setNames($companyName, $campaignName);
        $branding->setTagline($tagline);
        $branding->setTheme($theme ?? Theme::Plain);

        // F13 R27: absent leaves it alone, unlike the theme, which resets to
        // Plain. The difference is deliberate — a theme is a look somebody
        // chose today, a currency is a fact about the shop.
        if (null !== $currency) {
            $branding->setCurrency($currency);
        }

        $this->entityManager->flush();

        return new JsonResponse($this->presenter->present($branding));
    }

    #[Route('/logo', name: 'upload_logo', methods: ['POST'])]
    public function uploadLogo(Request $request): JsonResponse
    {
        $file = $request->files->get('logo');

        if (!$file instanceof UploadedFile) {
            return $this->invalid([new Violation('logo', $this->translator->trans('logo.required'))]);
        }

        $branding = $this->provider->getOrCreate();
        $previous = $branding->getLogoFilename();

        try {
            $stored = $this->logos->store($file);
        } catch (LogoRejected $rejected) {
            return $this->invalid([new Violation('logo', $this->translator->trans($rejected->getKey(), $rejected->getParameters()))]);
        }

        $branding->setLogo($stored['filename'], $stored['contentType']);
        $this->entityManager->flush();

        // F04 R17. Deleted only once the new one is safely recorded, so a
        // failure here never leaves the record pointing at nothing.
        $this->logos->delete($previous);

        return new JsonResponse([
            ...$this->presenter->present($branding),
            // F05 R10, R11: null unless sanitising actually took something out.
            'notice' => $this->noticeFor($stored['removed']),
        ]);
    }

    #[Route('/logo', name: 'delete_logo', methods: ['DELETE'])]
    public function deleteLogo(): JsonResponse
    {
        $branding = $this->provider->getOrCreate();
        $filename = $branding->getLogoFilename();

        $branding->clearLogo();
        $this->entityManager->flush();

        $this->logos->delete($filename);

        return new JsonResponse($this->presenter->present($branding));
    }

    /**
     * F05 R10. The upload succeeded; this says what the file lost on the
     * way in, so a logo that looks different is explained rather than
     * mysterious.
     *
     * @param list<string> $removed
     */
    private function noticeFor(array $removed): ?string
    {
        if ([] === $removed) {
            return null;
        }

        return $this->translator->trans('logo.sanitised_notice', [
            '%removed%' => implode(', ', $removed),
        ]);
    }

    /**
     * @param array<mixed>    $payload
     * @param list<Violation> $violations
     */
    private function readName(array $payload, string $field, array &$violations): ?string
    {
        return $this->readText($payload, $field, Branding::NAME_MAX_LENGTH, $violations);
    }

    /**
     * @param array<mixed>    $payload
     * @param list<Violation> $violations
     */
    private function readText(array $payload, string $field, int $maxLength, array &$violations): ?string
    {
        $value = $payload[$field] ?? null;

        if (null === $value) {
            return null;
        }

        if (!\is_string($value)) {
            $violations[] = new Violation($field, $this->translator->trans('branding.must_be_text'));

            return null;
        }

        if (mb_strlen(trim($value)) > $maxLength) {
            $violations[] = new Violation(
                $field,
                $this->translator->trans('branding.too_long', ['%max%' => $maxLength]),
            );

            return null;
        }

        return $value;
    }

    /**
     * F13 R27. Absent keeps what is stored, so a client that has not caught
     * up with this feature cannot silently reset a shop's currency.
     *
     * @param array<mixed>    $payload
     * @param list<Violation> $violations
     */
    private function readCurrency(array $payload, array &$violations): ?Currency
    {
        $value = $payload['currency'] ?? null;

        if (null === $value) {
            return null;
        }

        $currency = \is_string($value) ? Currency::tryFrom($value) : null;

        if (null === $currency) {
            $violations[] = new Violation(
                'currency',
                $this->translator->trans('branding.choose_one_of', [
                    '%values%' => implode(', ', array_column(Currency::cases(), 'value')),
                ]),
            );
        }

        return $currency;
    }

    /**
     * @param array<mixed>    $payload
     * @param list<Violation> $violations
     */
    private function readTheme(array $payload, array &$violations): ?Theme
    {
        $value = $payload['theme'] ?? null;

        if (null === $value) {
            return Theme::Plain;
        }

        // F04 R12: an unrecognised theme is rejected on the way in. The
        // forgiving fallback is only for values already in the database.
        $theme = \is_string($value) ? Theme::tryFrom($value) : null;

        if (null === $theme) {
            $violations[] = new Violation(
                'theme',
                $this->translator->trans('branding.choose_one_of', [
                    '%values%' => implode(', ', array_map(static fn (Theme $t): string => $t->value, Theme::cases())),
                ]),
            );
        }

        return $theme;
    }

    /**
     * @param list<Violation> $violations
     */
    private function invalid(array $violations): JsonResponse
    {
        return new JsonResponse(
            [
                'error' => [
                    'status' => Response::HTTP_UNPROCESSABLE_ENTITY,
                    'message' => $this->translator->trans('branding.invalid'),
                    'violations' => array_map(
                        static fn (Violation $violation): array => $violation->toArray(),
                        $violations,
                    ),
                ],
            ],
            Response::HTTP_UNPROCESSABLE_ENTITY,
        );
    }
}
