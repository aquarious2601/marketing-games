<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Branding\BrandingProvider;
use App\Branding\Currency;
use App\Dto\RewardInputParser;
use App\Dto\Violation;
use App\Entity\Reward;
use App\Repository\RewardRepository;
use App\Reward\RewardType;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bridge\Doctrine\Attribute\MapEntity;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * The reward catalogue (F13 R1–R6).
 *
 * Configuration only. What has actually been *won* lives in the spin log
 * (F09), which is where the code and the claim are — see F13 section 9.
 *
 * Behind ROLE_ADMIN by the `^/api/admin` rule in security.yaml (F07 R17).
 */
#[Route('/api/admin/rewards', name: 'api_admin_rewards_')]
final class RewardController extends AbstractController
{
    public function __construct(
        private readonly RewardRepository $rewards,
        private readonly RewardInputParser $parser,
        private readonly EntityManagerInterface $entityManager,
        private readonly TranslatorInterface $translator,
        private readonly BrandingProvider $branding,
    ) {
    }

    #[Route('', name: 'index', methods: ['GET'])]
    public function index(): JsonResponse
    {
        return new JsonResponse([
            'rewards' => array_map(
                fn (Reward $reward): array => $this->present($reward),
                $this->rewards->listAll(),
            ),
            // The admin's selector needs both lists, and sending them with
            // the catalogue saves the page a second request before it can
            // render a form.
            'types' => array_map(
                fn (array $type): array => [
                    'value' => $type['value'],
                    'label' => $this->translator->trans($type['label']),
                ],
                RewardType::values(),
            ),
        ]);
    }

    #[Route('', name: 'create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $payload = $this->decode($request);

        if ($payload instanceof JsonResponse) {
            return $payload;
        }

        [$draft, $violations] = $this->parser->parse($payload);
        $currency = $this->readCurrency($payload, $draft?->type, $violations);

        if (null === $draft || [] !== $violations) {
            return $this->invalid($violations);
        }

        $reward = new Reward($draft->name, $draft->type, $draft->value);

        return $this->save($reward, Response::HTTP_CREATED, $currency);
    }

    #[Route('/{id}', name: 'update', methods: ['PUT'], requirements: ['id' => '\d+'])]
    public function update(Request $request, #[MapEntity(id: 'id')] Reward $reward): JsonResponse
    {
        $payload = $this->decode($request);

        if ($payload instanceof JsonResponse) {
            return $payload;
        }

        [$draft, $violations] = $this->parser->parse($payload);
        $currency = $this->readCurrency($payload, $draft?->type, $violations);

        if (null === $draft || [] !== $violations) {
            return $this->invalid($violations);
        }

        $reward->setName($draft->name);
        // Type before value: setType clears a value the new type cannot
        // carry, so doing it the other way round would throw the new one
        // away (F13 R3).
        $reward->setType($draft->type);
        $reward->setValue($draft->value);

        return $this->save($reward, Response::HTTP_OK, $currency);
    }

    /** F13 R6. */
    #[Route('/{id}', name: 'delete', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    public function delete(#[MapEntity(id: 'id')] Reward $reward): JsonResponse
    {
        $slices = $this->rewards->slicePositionsUsing($reward);

        if ([] !== $slices) {
            // Pointed at, not counted: "it is on the wheel" leaves the admin
            // hunting for which slice. Since F26 the pointer is the position
            // rather than the label, because the label would be this very
            // reward's name.
            return $this->invalid([new Violation(
                '',
                $this->translator->trans('reward.in_use', [
                    '%slices%' => implode(', ', array_map(
                        static fn (int $position): string => '#'.$position,
                        $slices,
                    )),
                ]),
            )]);
        }

        $this->entityManager->remove($reward);
        $this->entityManager->flush();

        return new JsonResponse(null, Response::HTTP_NO_CONTENT);
    }

    /**
     * F13 R4: the unique index is the arbiter, not a prior SELECT.
     *
     * Checking first would still race two admins adding the same name, and
     * the constraint is the only thing that cannot be raced.
     */
    private function save(Reward $reward, int $status, ?Currency $currency = null): JsonResponse
    {
        try {
            // F15 R9: the campaign's currency is settled in the same request
            // that creates the amount, so the admin's one save is one save
            // and no amount can exist before its currency is known (R13).
            if (null !== $currency) {
                $this->branding->getOrCreate()->setCurrency($currency);
            }

            $this->entityManager->persist($reward);
            $this->entityManager->flush();
        } catch (UniqueConstraintViolationException) {
            // A failed flush closes the entity manager, so nothing further
            // may be written on this request — which is fine, because the
            // only thing left to do is say no.
            return $this->invalid([new Violation('name', $this->translator->trans('reward.name_taken'))]);
        }

        return new JsonResponse(['reward' => $this->present($reward)], $status);
    }

    /**
     * The campaign currency sent beside an amount (F15 R7, R9).
     *
     * Only read for a type that takes an amount. Sent with a free product
     * it is ignored rather than refused, for the same reason a *value* for
     * such a type is (F13 R3): the field the admin could not see is not a
     * field they got wrong.
     *
     * @param array<mixed>    $payload
     * @param list<Violation> $violations
     */
    private function readCurrency(array $payload, ?RewardType $type, array &$violations): ?Currency
    {
        $value = $payload['currency'] ?? null;

        if (null === $value || RewardType::AmountOff !== $type) {
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
     * @return array{id: int|null, name: string, type: string, value: int|null, createdAt: string, usedBy: list<string>}
     */
    private function present(Reward $reward): array
    {
        return [
            'id' => $reward->getId(),
            'name' => $reward->getName(),
            'type' => $reward->getType()->value,
            'value' => $reward->getValue(),
            'createdAt' => $reward->getCreatedAt()->format(\DateTimeInterface::ATOM),
            // So the list can show what is in use, and grey out its delete
            // before the admin presses it and is told no (F13 R6). Slice
            // positions since F26, counted from 1 (R24).
            'usedBy' => $this->rewards->slicePositionsUsing($reward),
        ];
    }

    private function decode(Request $request): mixed
    {
        try {
            return json_decode($request->getContent(), true, flags: \JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return $this->invalid([new Violation('', $this->translator->trans('api.invalid_json'))]);
        }
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
                    'message' => $this->translator->trans('reward.invalid'),
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
