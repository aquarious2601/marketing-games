<?php

declare(strict_types=1);

namespace App\Dto;

/**
 * One reason a submitted configuration was rejected (F01 R12).
 *
 * `$field` is addressed the way the client sees its own payload — `prizes`,
 * or `prizes[2].name` — so the admin UI can put the message on the right
 * input without guessing.
 */
final readonly class Violation
{
    public function __construct(
        public string $field,
        public string $message,
    ) {
    }

    /**
     * @return array{field: string, message: string}
     */
    public function toArray(): array
    {
        return ['field' => $this->field, 'message' => $this->message];
    }
}
