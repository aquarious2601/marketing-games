<?php

declare(strict_types=1);

namespace App\Branding;

/**
 * A logo that will not be stored (F04, F05).
 *
 * Everything it does is in {@see UploadRejected}; the name survives because
 * the logo endpoints catch this and nothing else, and a background's
 * rejection has no business being caught there.
 */
final class LogoRejected extends UploadRejected
{
}
