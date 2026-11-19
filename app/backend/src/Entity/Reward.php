<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\RewardRepository;
use App\Reward\RewardType;
use Doctrine\ORM\Mapping as ORM;

/**
 * Something the shop gives away (F13 R1).
 *
 * A catalogue rather than a type on the slice, because a reward is a thing
 * the business has: it outlives any one wheel, and the stock count, expiry
 * and redemption rules that will be wanted next all belong to it rather than
 * to the slice it happened to sit on. See F13 section 13.
 *
 * The slice keeps its own label (F13 R8), so this name is what the *admin*
 * calls the reward, not necessarily what a player reads.
 */
#[ORM\Entity(repositoryClass: RewardRepository::class)]
#[ORM\Table(name: 'reward')]
#[ORM\UniqueConstraint(name: 'uniq_reward_name', columns: ['name'])]
class Reward
{
    /**
     * F13 R4, widened from 60 by F26 R25.
     *
     * It is the one name in the system now: the catalogue's, the wheel's, and
     * the snapshot a spin keeps. 60 was chosen when a slice had a label of
     * its own and this was only an admin's private word for a prize; with
     * the two merged there is no reason for the cap to be tighter than the
     * thing it has to hold. The wheel wraps and truncates what will not fit
     * (WheelPreview), so the limit is about storage rather than drawing.
     *
     * 256 four-byte characters is a 1,024-byte unique index, inside InnoDB's
     * 3,072-byte limit on a DYNAMIC table — which is MariaDB's default row
     * format and what both the development and the deployed databases use.
     */
    public const NAME_MAX_LENGTH = 256;

    /** F13 R12: what the losing slice is called before the admin renames it. */
    public const DEFAULT_LOSING_KEY = 'reward.default_losing';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: self::NAME_MAX_LENGTH, unique: true)]
    private string $name;

    #[ORM\Column(length: 20)]
    private string $type;

    /**
     * Null for a free product and for nothing (F13 R3). Nullable rather than
     * zero, so "this type has no value" and "this discount is zero" stay
     * different facts.
     *
     * An integer rather than a smallint since F21: a smallint stops at
     * 32,767, which is not a price in dong. On a database without strict
     * mode it stored 32,767 and said nothing, which is how this survived
     * eight features.
     */
    #[ORM\Column(type: 'integer', nullable: true)]
    private ?int $value = null;

    /**
     * F32 R1, R2, R7. What handing one of these over costs the shop, in
     * the store's currency.
     *
     * A different fact from `value`, which is what the *customer* saves:
     * a 20% off has a value of 20 and costs whatever a fifth of a basket
     * comes to; a free coffee has no value at all and costs what the
     * coffee costs. Two facts, two columns.
     *
     * Nullable because unpriced is not zero (R7): a reward that genuinely
     * costs nothing is a zero somebody typed, and the stats say how many
     * wins they could not price rather than quietly totalling them as
     * free.
     */
    #[ORM\Column(type: 'integer', nullable: true)]
    private ?int $cost = null;

    #[ORM\Column(name: 'created_at')]
    private \DateTimeImmutable $createdAt;

    public function __construct(string $name, RewardType $type, ?int $value = null)
    {
        $this->name = $name;
        $this->type = $type->value;
        $this->value = $type->needsValue() ? $value : null;
        $this->createdAt = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function setName(string $name): void
    {
        $this->name = $name;
    }

    public function getType(): RewardType
    {
        return RewardType::fromStorage($this->type);
    }

    /**
     * Setting the type clears a value the new type cannot carry, so a reward
     * changed from 10% off to a free product cannot keep a stray 10 that
     * nothing displays and something later reads.
     */
    public function setType(RewardType $type): void
    {
        $this->type = $type->value;

        if (!$type->needsValue()) {
            $this->value = null;
        }

        // F32 R4, for the same reason the value is cleared above.
        if (RewardType::Nothing === $type) {
            $this->cost = null;
        }
    }

    public function getValue(): ?int
    {
        return $this->value;
    }

    /** F32 R1. Null is unpriced, which is not zero (R7). */
    public function getCost(): ?int
    {
        return $this->cost;
    }

    /**
     * F32 R4. The losing reward takes none: nothing is handed over, so
     * nothing is spent, and a cost on it would be a number waiting to be
     * added into a total it does not belong in.
     */
    public function setCost(?int $cost): void
    {
        $this->cost = RewardType::Nothing === $this->getType() ? null : $cost;
    }

    public function setValue(?int $value): void
    {
        $this->value = $this->getType()->needsValue() ? $value : null;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    /** F13 R15, R24, and with F16 R1 also "is it issued a code". */
    public function isClaimable(): bool
    {
        return $this->getType()->isClaimable();
    }
}
