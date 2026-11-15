<?php

declare(strict_types=1);

namespace App\Security;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Contracts\Translation\TranslatorInterface;
use Symfony\Component\Security\Http\EntryPoint\AuthenticationEntryPointInterface;

/**
 * What an unauthenticated request to a protected route gets (F07 R18).
 *
 * Symfony's default is to redirect to a login page, which is right for a
 * server-rendered app and wrong for this one: a fetch() would follow the
 * redirect and receive 200 with a page of HTML, so the SPA would see a
 * success it cannot parse instead of "you are signed out".
 */
final class JsonAuthenticationEntryPoint implements AuthenticationEntryPointInterface
{
    public function __construct(
        private readonly TranslatorInterface $translator,
    ) {
    }

    public function start(Request $request, ?AuthenticationException $authException = null): Response
    {
        return new JsonResponse(
            [
                'error' => [
                    'status' => Response::HTTP_UNAUTHORIZED,
                    'message' => $this->translator->trans('api.sign_in_required'),
                ],
            ],
            Response::HTTP_UNAUTHORIZED,
        );
    }
}
