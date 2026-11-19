<?php

declare(strict_types=1);

namespace App\Player;

use App\Entity\Player;

/**
 * A registration's outcome: the customer, and whether this request is what
 * created them (F34 R9).
 *
 * The flag exists because the page cannot work it out. `register` returns the
 * customer who already holds the number (F08 R7), so "is this somebody new"
 * is a fact about what the server did, not about what the page sent — and
 * F34 R8 hangs on it: a card is shown to a customer being created and to
 * nobody else, because anybody may type anybody's number into a stall phone.
 */
final readonly class Registered
{
    public function __construct(
        public Player $player,
        public bool $created,
    ) {
    }
}
