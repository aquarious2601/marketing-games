<?php

declare(strict_types=1);

namespace App\Controller;

use App\Branding\BackgroundStore;
use App\Game\LinkKey;
use App\Repository\GameRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Serves a game's uploaded background (F35 R13, R14).
 *
 * Uploads live outside the web root, so this route is the only way to reach
 * them. The content type sent back is the one verified at upload time, and
 * nosniff stops a browser from deciding the bytes are something more
 * interesting than an image.
 *
 * Keyed by the game's link key rather than its id: the key is the one
 * identifier a game already publishes, and the player's page is holding it
 * anyway. It is not gated on the game being live — the admin looks at this
 * same URL while a promotion is still being built, and a sixteen-character
 * key is what stands between a picture and a stranger, exactly as it does
 * for the game itself.
 */
final class BackgroundController extends AbstractController
{
    public function __construct(
        private readonly GameRepository $games,
        private readonly BackgroundStore $backgrounds,
    ) {
    }

    #[Route('/api/branding/background/{key}', name: 'api_branding_background', methods: ['GET'])]
    public function __invoke(string $key): Response
    {
        $game = LinkKey::looksLikeOne($key) ? $this->games->findByKey($key) : null;
        $filename = $game?->getBackground();

        // One answer for every way of not having a picture — no game, no
        // picture, a file that went missing — so nothing here can be used to
        // tell those apart.
        if (null === $filename || !$this->backgrounds->exists($filename)) {
            throw $this->createNotFoundException('No background has been set.');
        }

        $response = new BinaryFileResponse($this->backgrounds->pathFor($filename));

        $response->headers->set('Content-Type', $this->backgrounds->contentTypeFor($filename));
        $response->headers->set('X-Content-Type-Options', 'nosniff');

        // Served under a URL that changes when the picture does (F35 R14),
        // so it is safe to let browsers hold on to it — and worth it, since
        // this is the largest thing the player's page fetches.
        $response->setPublic();
        $response->setMaxAge(3600);

        return $response;
    }
}
