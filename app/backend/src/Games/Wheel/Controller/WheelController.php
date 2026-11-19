<?php

declare(strict_types=1);

namespace App\Games\Wheel\Controller;

use App\Dto\Violation;
use App\Games\Wheel\Dto\WheelInputParser;
use App\Games\Wheel\WheelPresenter;
use App\Games\Wheel\WheelProvider;
use App\Games\Wheel\WheelWriter;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * Reading and replacing the wheel configuration.
 *
 * Deliberately unauthenticated for now (F01 R15). This must not be deployed
 * publicly before admin authentication exists: anyone who can reach these
 * routes can rewrite the prizes and the odds.
 */
#[Route('/api/admin/wheel', name: 'api_admin_wheel_')]
final class WheelController extends AbstractController
{
    public function __construct(
        private readonly WheelProvider $provider,
        private readonly WheelWriter $writer,
        private readonly WheelPresenter $presenter,
        private readonly WheelInputParser $parser,
        private readonly TranslatorInterface $translator,
    ) {
    }

    #[Route('', name: 'show', methods: ['GET'])]
    public function show(): JsonResponse
    {
        return new JsonResponse($this->presenter->present($this->provider->getOrCreate()));
    }

    #[Route('', name: 'replace', methods: ['PUT'])]
    public function replace(Request $request): JsonResponse
    {
        try {
            /** @var mixed $payload */
            $payload = json_decode($request->getContent(), true, flags: \JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return $this->invalid([new Violation('', $this->translator->trans('api.invalid_json'))]);
        }

        [$draft, $violations] = $this->parser->parse($payload);

        if (null === $draft) {
            return $this->invalid($violations);
        }

        // Loading the wheel after parsing keeps a malformed request from
        // creating a default wheel as a side effect.
        $wheel = $this->provider->getOrCreate();

        $violations = $this->writer->apply($wheel, $draft);

        if ([] !== $violations) {
            return $this->invalid($violations);
        }

        return new JsonResponse($this->presenter->present($wheel));
    }

    /**
     * F01 R12. Shaped like the error envelope the API uses everywhere else,
     * with the per-field detail added.
     *
     * @param list<Violation> $violations
     */
    private function invalid(array $violations): JsonResponse
    {
        return new JsonResponse(
            [
                'error' => [
                    'status' => Response::HTTP_UNPROCESSABLE_ENTITY,
                    'message' => $this->translator->trans('wheel.invalid'),
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
