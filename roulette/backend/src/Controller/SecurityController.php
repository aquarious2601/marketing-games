<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\User;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\Translation\TranslatorInterface;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Signing in and out (F07 R10, R14, R15).
 *
 * The login and logout routes are declared but never execute: the firewall
 * intercepts both. They exist so the routes have names for security.yaml to
 * point at, which is how Symfony's json_login is wired.
 */
final class SecurityController extends AbstractController
{
    public function __construct(
        private readonly TranslatorInterface $translator,
    ) {
    }

    #[Route('/api/login', name: 'api_login', methods: ['POST'])]
    public function login(#[CurrentUser] ?User $user): JsonResponse
    {
        // Reached only on success; a failure is answered by the firewall.
        if (null === $user) {
            return new JsonResponse(
                ['error' => ['status' => 401, 'message' => $this->translator->trans('auth.bad_credentials')]],
                Response::HTTP_UNAUTHORIZED,
            );
        }

        return new JsonResponse($this->describe($user));
    }

    #[Route('/api/logout', name: 'api_logout', methods: ['POST'])]
    public function logout(): never
    {
        throw new \LogicException('Intercepted by the firewall before it gets here.');
    }

    /**
     * F07 R15. Public on purpose: the SPA asks this on every load to decide
     * whether to show the admin or the login page, and a 401 is the answer
     * rather than an error.
     */
    #[Route('/api/me', name: 'api_me', methods: ['GET'])]
    public function me(#[CurrentUser] ?User $user): JsonResponse
    {
        if (null === $user) {
            return new JsonResponse(
                ['error' => ['status' => 401, 'message' => $this->translator->trans('auth.nobody_signed_in')]],
                Response::HTTP_UNAUTHORIZED,
            );
        }

        return new JsonResponse($this->describe($user));
    }

    /**
     * @return array{id: int|null, username: string}
     */
    private function describe(User $user): array
    {
        // Deliberately not the roles or the hash: the SPA has no use for
        // either, and neither should travel further than it must.
        return ['id' => $user->getId(), 'username' => $user->getUsername()];
    }
}
