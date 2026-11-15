<?php

declare(strict_types=1);

namespace App\Dto;

/**
 * A validated wheel configuration, as submitted. Nothing constructs one of
 * these unless every rule in F01 section 6 holds, so anything downstream can
 * trust it completely.
 *
 * @see \App\Dto\WheelInputParser
 */
final readonly class WheelDraft
{
    /**
     * @param list<PrizeDraft> $prizes in the order the admin wants them
     */
    public function __construct(
        public array $prizes,
    ) {
    }
}
