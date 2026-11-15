<?php

declare(strict_types=1);

namespace App\Dto;

/**
 * One validated prize from a submitted configuration.
 *
 * `$id` is null for a prize the admin has just added; an existing prize keeps
 * its id so that saving does not change its identity (F01 R11).
 */
final readonly class PrizeDraft
{
    public function __construct(
        public ?int $id,
        public string $name,
        public int $probability,
    ) {
    }
}
