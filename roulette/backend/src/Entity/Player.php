<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\PlayerRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * Someone who has told us who they are (F08 R2).
 *
 * The phone number is the identity, not a field on it: there is no other id a
 * player ever gives, so the canonical number carries the unique constraint
 * (F08 R9) and everything else on the row is what we asked for once.
 *
 * Three facts and a number is the whole of it (F08 R8, R24). Anything added
 * here needs a stated purpose, because this is the only table in the project
 * holding personal data.
 */
#[ORM\Entity(repositoryClass: PlayerRepository::class)]
#[ORM\Table(name: 'player')]
#[ORM\UniqueConstraint(name: 'uniq_player_phone', columns: ['phone'])]
class Player
{
    /**
     * F08 R3, R4. Long enough for 20 digits and a leading `+`, with room to
     * spare rather than room to be exactly wrong.
     */
    public const PHONE_MAX_LENGTH = 24;

    /** F08 R4 */
    public const MIN_PHONE_DIGITS = 6;
    public const MAX_PHONE_DIGITS = 20;

    /** F08 R10 */
    public const NAME_MAX_LENGTH = 40;

    /** F08 R10. A birthday before this is a typo, not a customer. */
    public const EARLIEST_BIRTHDAY = '1900-01-01';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    /** The canonical form only (F08 R3). Never what the player typed. */
    #[ORM\Column(length: self::PHONE_MAX_LENGTH, unique: true)]
    private string $phone;

    #[ORM\Column(name: 'first_name', length: self::NAME_MAX_LENGTH)]
    private string $firstName;

    #[ORM\Column(name: 'last_name', length: self::NAME_MAX_LENGTH)]
    private string $lastName;

    /**
     * A calendar date, so `date_immutable` rather than a datetime: a birthday
     * has no time and belongs to no timezone, and storing one as a UTC
     * instant moves it a day for half the world.
     */
    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $birthday;

    #[ORM\Column(name: 'created_at')]
    private \DateTimeImmutable $createdAt;

    public function __construct(
        string $phone,
        string $firstName,
        string $lastName,
        \DateTimeImmutable $birthday,
    ) {
        $this->phone = $phone;
        $this->firstName = $firstName;
        $this->lastName = $lastName;
        $this->birthday = $birthday;
        $this->createdAt = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getPhone(): string
    {
        return $this->phone;
    }

    public function getFirstName(): string
    {
        return $this->firstName;
    }

    public function getLastName(): string
    {
        return $this->lastName;
    }

    public function getBirthday(): \DateTimeImmutable
    {
        return $this->birthday;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }
}
