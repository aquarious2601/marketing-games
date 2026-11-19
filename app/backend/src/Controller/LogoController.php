<?php

declare(strict_types=1);

namespace App\Controller;

use App\Store\StoreProvider;
use App\Branding\LogoStore;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Serves the uploaded logo (F04 R19, R21).
 *
 * Uploads live outside the web root, so this route is the only way to reach
 * them. That is the point: the content type sent back is the one verified at
 * upload time, and nosniff stops a browser from deciding the bytes are
 * something more interesting than an image.
 */
final class LogoController extends AbstractController
{
    public function __construct(
        private readonly StoreProvider $provider,
        private readonly LogoStore $logos,
    ) {
    }

    #[Route('/api/branding/logo', name: 'api_branding_logo', methods: ['GET'])]
    public function __invoke(): Response
    {
        $store = $this->provider->getOrCreate();
        $filename = $store->getLogoFilename();

        if (null === $filename || !$this->logos->exists($filename)) {
            throw $this->createNotFoundException('No logo has been set.');
        }

        $response = new BinaryFileResponse($this->logos->pathFor($filename));

        $contentType = $store->getLogoContentType() ?? 'application/octet-stream';

        $response->headers->set('Content-Type', $contentType);
        $response->headers->set('X-Content-Type-Options', 'nosniff');

        if (LogoStore::SVG_CONTENT_TYPE === $contentType) {
            // F05 R13. The sanitiser should already have removed anything
            // dangerous; this is the layer that holds if it ever does not.
            // `sandbox` with no tokens puts the document in a unique origin
            // with scripting disabled, so opening this URL directly runs
            // nothing even if script survived.
            $response->headers->set(
                'Content-Security-Policy',
                "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            );
        }
        // Served under a URL that changes when the logo does, so it is safe
        // to let browsers hold on to it.
        $response->setPublic();
        $response->setMaxAge(3600);

        return $response;
    }
}
