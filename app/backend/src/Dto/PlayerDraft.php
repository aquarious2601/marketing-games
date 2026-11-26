<?php

declare(strict_types=1);

namespace App\Dto;

/**
 * A registration that has been read and found usable (F08 R6).
 *
 * The phone number here is already canonical (F08 R3): nothing downstream
 * ever sees what the player actually typed, so nothing downstream can store
 * it by accident.
 */
final readonly class PlayerDraft
{
    public function __construct(
        public string $phone,
        public string $firstName,
        public string $lastName,
        /** F38 R1. The day and the month, and no year. */
        public int $birthDay,
        public int $birthMonth,
    ) {
    }
}
