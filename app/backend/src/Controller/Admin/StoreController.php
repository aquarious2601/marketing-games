<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Branding\BrandingPresenter;
use App\Store\StoreProvider;
use App\Branding\LogoRejected;
use App\Branding\LogoStore;
use App\Branding\Currency;
use App\Branding\Theme;
use App\Dto\Violation;
use App\Entity\Store;
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
#[Route('/api/admin/store', name: 'api_admin_store_')]
final class StoreController extends AbstractController
{
    /**
     * @param list<string> $enabledLocales the four languages F12 R1 names,
     *                                     bound in services.yaml so this
     *                                     controller does not keep a second
     *                                     copy of the list
     */
    public function __construct(
        private readonly StoreProvider $provider,
        private readonly BrandingPresenter $presenter,
        private readonly LogoStore $logos,
        private readonly EntityManagerInterface $entityManager,
        private readonly TranslatorInterface $translator,
        private readonly array $enabledLocales,
    ) {
    }

    #[Route('', name: 'show', methods: ['GET'])]
    public function show(): JsonResponse
    {
        $store = $this->provider->getOrCreate();

        return new JsonResponse([
            ...$this->presenter->present($store),
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
            'ownCurrency' => $store->getOwnCurrency()?->value,
            // F15 R2: what this admin's language suggests. Only ever used
            // while nothing has been chosen.
            'defaultCurrency' => $this->presenter->defaultCurrency()->value,
            /*
             * F27 R15, R17. The clock is never null and is never offered as
             * a default to accept: the form makes the admin pick one, and the
             * upgrade seeded existing shops from APP_TIMEZONE. A null
             * language means no choice, and the browser decides as it always
             * has.
             */
            'language' => $store->getLanguage(),
            'timezone' => $store->getTimezone(),
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
        $theme = $this->readTheme($payload, $violations);
        $currency = $this->readCurrency($payload, $violations);
        $language = $this->readLanguage($payload, $violations);
        $timezone = $this->readTimezone($payload, $violations);

        if ([] !== $violations) {
            return $this->invalid($violations);
        }

        $store = $this->provider->getOrCreate();
        $store->setCompanyName($companyName);
        $store->setTheme($theme ?? Theme::Plain);
        $store->setLanguage($language);

        // F27 R15: absent leaves the clock alone, like the currency below.
        // A request that forgot the field must not move the shop's day.
        if (null !== $timezone) {
            $store->setTimezone($timezone);
        }

        // F13 R27: absent leaves it alone, unlike the theme, which resets to
        // Plain. The difference is deliberate — a theme is a look somebody
        // chose today, a currency is a fact about the shop.
        if (null !== $currency) {
            $store->setCurrency($currency);
        }

        $this->entityManager->flush();

        return new JsonResponse($this->presenter->present($store));
    }

    #[Route('/logo', name: 'upload_logo', methods: ['POST'])]
    public function uploadLogo(Request $request): JsonResponse
    {
        $file = $request->files->get('logo');

        if (!$file instanceof UploadedFile) {
            return $this->invalid([new Violation('logo', $this->translator->trans('logo.required'))]);
        }

        $store = $this->provider->getOrCreate();
        $previous = $store->getLogoFilename();

        try {
            $stored = $this->logos->store($file);
        } catch (LogoRejected $rejected) {
            return $this->invalid([new Violation('logo', $this->translator->trans($rejected->getKey(), $rejected->getParameters()))]);
        }

        $store->setLogo($stored['filename'], $stored['contentType']);
        $this->entityManager->flush();

        // F04 R17. Deleted only once the new one is safely recorded, so a
        // failure here never leaves the record pointing at nothing.
        $this->logos->delete($previous);

        return new JsonResponse([
            ...$this->presenter->present($store),
            // F05 R10, R11: null unless sanitising actually took something out.
            'notice' => $this->noticeFor($stored['removed']),
        ]);
    }

    #[Route('/logo', name: 'delete_logo', methods: ['DELETE'])]
    public function deleteLogo(): JsonResponse
    {
        $store = $this->provider->getOrCreate();
        $filename = $store->getLogoFilename();

        $store->clearLogo();
        $this->entityManager->flush();

        $this->logos->delete($filename);

        return new JsonResponse($this->presenter->present($store));
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
        return $this->readText($payload, $field, Store::NAME_MAX_LENGTH, $violations);
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
     * F27 R17. One of the four languages, or null for "let the browser
     * decide", which is what every shop has until somebody picks.
     *
     * @param array<mixed>    $payload
     * @param list<Violation> $violations
     */
    private function readLanguage(array $payload, array &$violations): ?string
    {
        /** @var mixed $value */
        $value = $payload['language'] ?? null;

        if (null === $value || '' === $value) {
            return null;
        }

        if (!is_string($value) || !in_array($value, $this->enabledLocales, true)) {
            $violations[] = new Violation(
                'language',
                $this->translator->trans('store.language_invalid'),
            );

            return null;
        }

        return $value;
    }

    /**
     * F27 R15, R34. An identifier this runtime recognises, or a violation.
     *
     * Absent returns null and leaves the stored clock alone, like the
     * currency: a client that has not caught up with this feature must not be
     * able to move a shop's day by forgetting a field.
     *
     * Checked here as well as in the entity, so an admin gets a violation
     * against the field rather than a 500 out of a constructor.
     *
     * @param array<mixed>    $payload
     * @param list<Violation> $violations
     */
    private function readTimezone(array $payload, array &$violations): ?string
    {
        /** @var mixed $value */
        $value = $payload['timezone'] ?? null;

        if (null === $value) {
            return null;
        }

        if (is_string($value) && in_array($value, timezone_identifiers_list(), true)) {
            return $value;
        }

        $violations[] = new Violation(
            'timezone',
            $this->translator->trans('store.timezone_invalid'),
        );

        return null;
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
