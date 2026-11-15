<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\Spin;
use App\Player\PlayerPresenter;
use App\Repository\SpinRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bridge\Doctrine\Attribute\MapEntity;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * The whole spin log (F09 R13–R20).
 *
 * The question this answers is "what went out today", which the per-player
 * history from F08 R22 cannot — see F09 R12 for why both exist rather than
 * one of them being the other with a filter applied.
 *
 * Behind ROLE_ADMIN by the `^/api/admin` rule in security.yaml (F07 R17).
 */
#[Route('/api/admin/spins', name: 'api_admin_spins_')]
final class SpinController extends AbstractController
{
    public function __construct(
        private readonly SpinRepository $spins,
        private readonly PlayerPresenter $presenter,
        private readonly EntityManagerInterface $entityManager,
        private readonly TranslatorInterface $translator,
    ) {
    }

    #[Route('', name: 'index', methods: ['GET'])]
    public function index(Request $request): JsonResponse
    {
        $filter = trim((string) $request->query->get('phone', ''));
        $filter = '' === $filter ? null : $filter;

        $spins = $this->spins->listRecent($filter);

        return new JsonResponse([
            'spins' => array_map(
                fn (Spin $spin): array => $this->presenter->presentLoggedSpin($spin),
                $spins,
            ),
            /**
             * F09 R16, R21: how many match, not how many came back.
             *
             * Counted separately rather than taken from the array above,
             * which is capped. This is the number that lets the page say
             * "the most recent 200 of 1,432" instead of quietly presenting a
             * truncated list as the whole log.
             */
            'total' => $this->spins->countMatching($filter),
        ]);
    }

    /**
     * Marking a reward handed over, or taking that back (F13 R22, R23).
     *
     * A PUT with the state wanted rather than two verbs, because the thing
     * being set is a property with two values and staff at a counter press
     * the same control to correct a mistake as to make one.
     */
    #[Route('/{id}/claim', name: 'claim', methods: ['PUT'], requirements: ['id' => '\d+'])]
    public function claim(Request $request, #[MapEntity(id: 'id')] Spin $spin): JsonResponse
    {
        // F13 R24: a losing item has nothing to hand over. Refused rather
        // than ignored, so a client that offers the control learns it should
        // not have.
        if (!$spin->isClaimable()) {
            return new JsonResponse(
                [
                    'error' => [
                        'status' => Response::HTTP_UNPROCESSABLE_ENTITY,
                        'message' => $this->translator->trans('spin.not_claimable'),
                    ],
                ],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        try {
            /** @var mixed $payload */
            $payload = json_decode($request->getContent(), true, flags: \JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            $payload = null;
        }

        // Absent means claim: the common case is one tap on a row, and a
        // body is only needed to say "actually, no".
        $claimed = \is_array($payload) && \array_key_exists('claimed', $payload)
            ? true === $payload['claimed']
            : true;

        $spin->setClaimed($claimed);
        $this->entityManager->flush();

        return new JsonResponse(['spin' => $this->presenter->presentLoggedSpin($spin)]);
    }
}
