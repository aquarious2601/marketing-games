<?php

declare(strict_types=1);

namespace App\Entity;

use App\Player\CustomerCode;
use App\Player\PhoneMatch;
use App\Repository\PlayerRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * Someone who has told us who they are (F08 R2).
 *
 * The phone number is the identity, not a field on it: there is no other id a
 * player ever gives, so the canonical number carries the unique constraint
 * (F08 R9) and everything else on the row is what we asked for once.
 *
 * Which number that is, is decided by comparing numbers rather than
 * strings (F19 R1, R2): the row keeps what was typed, and
 * App\\Player\\PhoneMatch decides whether another spelling is the same one.
 *
 * Three facts and a number is the whole of it (F08 R8, R24). Anything added
 * here needs a stated purpose, because this is the only table in the project
 * holding personal data.
 */
#[ORM\Entity(repositoryClass: PlayerRepository::class)]
#[ORM\Table(name: 'player')]
#[ORM\UniqueConstraint(name: 'uniq_player_phone', columns: ['phone'])]
#[ORM\UniqueConstraint(name: 'uniq_player_code', columns: ['code'])]
#[ORM\Index(name: 'idx_player_phone_tail', columns: ['phone_tail'])]
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

    /**
     * F08 R10. A birthday before this is a typo, not a customer.
     *
     * Kept for the dates already on file (F38 R5); nothing new is measured
     * against it, because nothing new carries a year.
     */
    public const EARLIEST_BIRTHDAY = '1900-01-01';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    /** The canonical form only (F08 R3). Never what the player typed. */
    #[ORM\Column(length: self::PHONE_MAX_LENGTH, unique: true)]
    private string $phone;

    /**
     * The last few digits, so a lookup by number does not read the table
     * (F19 R4). Not unique and not an answer: it narrows a lookup to a
     * handful of rows, and PhoneMatch::same() decides between them.
     *
     * Derived in the constructor and nowhere else, so it cannot drift out of
     * step with the column it summarises and no request can set it. There is
     * deliberately no setter: a number does not change, and if one ever did,
     * its tail would change with it (F19 R5).
     */
    #[ORM\Column(name: 'phone_tail', length: PhoneMatch::TAIL_LENGTH)]
    private string $phoneTail;

    #[ORM\Column(name: 'first_name', length: self::NAME_MAX_LENGTH)]
    private string $firstName;

    #[ORM\Column(name: 'last_name', length: self::NAME_MAX_LENGTH)]
    private string $lastName;

    /**
     * F38 R1, R2. The two numbers a birthday gift needs.
     *
     * Separate columns rather than a date with a pretended year: a row that
     * says 1970 would be a row that says something untrue, and the next
     * person to read the table would have no way to know it.
     */
    #[ORM\Column(name: 'birth_day', type: 'smallint')]
    private int $birthDay;

    #[ORM\Column(name: 'birth_month', type: 'smallint')]
    private int $birthMonth;

    /**
     * The full date, for the customers who gave one before F38 (R5).
     *
     * A calendar date, so `date_immutable` rather than a datetime: a
     * birthday has no time and belongs to no timezone, and storing one as a
     * UTC instant moves it a day for half the world.
     *
     * Null from F38 onward, and never written again. It is not read by
     * anything and is not sent anywhere (R6); it is here because deleting
     * what was already collected is not this feature's call to make.
     */
    #[ORM\Column(type: 'date_immutable', nullable: true)]
    private ?\DateTimeImmutable $birthday = null;

    #[ORM\Column(name: 'created_at')]
    private \DateTimeImmutable $createdAt;

    /**
     * The card they keep (F34 R1). Derived in the constructor like the
     * phone's tail above, and for the same reason: it belongs to the row
     * from the moment the row exists, in the same transaction, and no
     * request can set it.
     *
     * There is no setter at all. A customer keeps the code they were given
     * (F34 R6), so the photograph they took in January still works in June.
     */
    #[ORM\Column(length: CustomerCode::STORED_LENGTH, unique: true)]
    private string $code;

    public function __construct(
        string $phone,
        string $firstName,
        string $lastName,
        int $birthDay,
        int $birthMonth,
    ) {
        $this->phone = $phone;
        $this->phoneTail = PhoneMatch::tail($phone);
        $this->firstName = $firstName;
        $this->lastName = $lastName;
        $this->birthDay = $birthDay;
        $this->birthMonth = $birthMonth;
        $this->createdAt = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        $this->code = CustomerCode::generate();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getPhone(): string
    {
        return $this->phone;
    }

    /** F34 R1. Uniqueness is the index's promise, not the generator's (R3). */
    public function getCode(): string
    {
        return $this->code;
    }

    public function getPhoneTail(): string
    {
        return $this->phoneTail;
    }

    public function getFirstName(): string
    {
        return $this->firstName;
    }

    public function getLastName(): string
    {
        return $this->lastName;
    }

    /** F38 R1. 1 to 31. */
    public function getBirthDay(): int
    {
        return $this->birthDay;
    }

    /** F38 R1. 1 to 12. */
    public function getBirthMonth(): int
    {
        return $this->birthMonth;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }
}
