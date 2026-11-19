<?php

declare(strict_types=1);

namespace App\Dto;

use App\Reward\RewardType;

/**
 * A reward that has been read and found usable (F13 R1).
 *
 * `$value` is already null for the types that take none (F13 R3), so
 * nothing downstream has to ask again.
 */
final readonly class RewardDraft
{
    public function __construct(
        public string $name,
        public RewardType $type,
        public ?int $value,
        /**
         * F32 R1, R7. What handing one over costs the shop, or null for
         * unpriced — which is not the same as zero.
         */
        public ?int $cost = null,
    ) {
    }
}
