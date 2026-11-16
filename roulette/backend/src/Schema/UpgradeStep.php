<?php

declare(strict_types=1);

namespace App\Schema;

/**
 * What one step of the upgrade did (P02 R2, R4).
 *
 * A step that found nothing to do is not a failure and not a silence: the
 * operator is told it was considered and skipped, because "nothing to do"
 * repeated eleven times is how you read that a database is already current.
 */
final readonly class UpgradeStep
{
    private function __construct(
        public string $name,
        public bool $changed,
        public string $detail,
    ) {
    }

    public static function done(string $name, string $detail): self
    {
        return new self($name, true, $detail);
    }

    public static function skipped(string $name, string $detail = 'already applied'): self
    {
        return new self($name, false, $detail);
    }
}
