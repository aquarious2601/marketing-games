<?php

declare(strict_types=1);

namespace App\Branding;

/**
 * An upload that will not be stored, with a message the admin can act on.
 *
 * It carries a translation key rather than a sentence (F12 R15, R16). The
 * English text stays as the exception message so a log line is readable
 * without a translator, but what reaches the admin is translated at the
 * controller, in their language.
 *
 * Shared by the logo (F04, F05) and the background (F35). The two stores
 * accept different files for different reasons, but "rejected, and here is
 * the key that says why" is the same sentence twice, and a second copy of
 * it is a second place for the translation contract to drift.
 */
class UploadRejected extends \RuntimeException
{
    /**
     * @param array<string, string|int> $parameters
     */
    public function __construct(
        private readonly string $key,
        private readonly array $parameters = [],
        string $englishForTheLog = '',
    ) {
        parent::__construct('' === $englishForTheLog ? $key : $englishForTheLog);
    }

    public function getKey(): string
    {
        return $this->key;
    }

    /**
     * @return array<string, string|int>
     */
    public function getParameters(): array
    {
        return $this->parameters;
    }
}
