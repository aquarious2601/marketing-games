<?php

declare(strict_types=1);

namespace App\Security;

use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Http\Event\LogoutEvent;

/**
 * Answers a logout with JSON rather than a redirect (F07 R14).
 *
 * Symfony's default is to redirect to the home page, which is right for a
 * server-rendered app. Here the caller is fetch(): it would quietly follow
 * the redirect, fetch the whole SPA shell, and report a 200 full of HTML —
 * so the page could not tell a successful sign-out from anything else.
 */
#[AsEventListener(event: LogoutEvent::class)]
final class JsonLogoutListener
{
    public function __invoke(LogoutEvent $event): void
    {
        $event->setResponse(new JsonResponse(null, Response::HTTP_NO_CONTENT));
    }
}
