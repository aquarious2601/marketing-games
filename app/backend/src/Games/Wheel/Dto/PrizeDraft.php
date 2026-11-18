<?php

declare(strict_types=1);

namespace App\Games\Wheel\Dto;

/**
 * One validated prize from a submitted configuration.
 *
 * `$id` is null for a prize the admin has just added; an existing prize keeps
 * its id so that saving does not change its identity (F01 R11).
 *
 * `$rewardId` is what the slice gives away (F13 R7). Required, because a
 * slice pointing at nothing is a slice nobody can honour.
 */
final readonly class PrizeDraft
{
    public function __construct(
        public ?int $id,
        public int $probability,
        public int $rewardId,
    ) {
    }
}
