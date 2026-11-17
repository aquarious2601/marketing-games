<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\SpinRepository;
use App\Reward\RewardType;
use Doctrine\ORM\Mapping as ORM;

/**
 * One play of the wheel (F02 R9).
 *
 * The prize name and probability are copied in rather than read through the
 * relation, because the admin will rename, reweight and delete prizes. A spin
 * from last week has to keep saying what was actually won and how likely it
 * actually was, so the link is a convenience and the snapshot is the record.
 */
#[ORM\Entity(repositoryClass: SpinRepository::class)]
#[ORM\Table(name: 'spin')]
#[ORM\Index(name: 'idx_spin_spun_at', columns: ['spun_at'])]
class Spin
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    /**
     * Nullable on purpose (F02 R11): deleting a prize must not take the
     * history of it with it.
     */
    #[ORM\ManyToOne]
    #[ORM\JoinColumn(name: 'prize_id', nullable: true, onDelete: 'SET NULL')]
    private ?Prize $prize = null;

    /**
     * Who spun it (F08 R17).
     *
     * Nullable, and by reference rather than by value — which is the opposite
     * of how the prize above is kept, for the opposite reason. The prize is
     * snapshotted because the record of what went out has to survive the
     * prize being deleted. A player's name is deliberately *not*
     * snapshotted, because then deleting a player would leave their name on
     * every spin they ever made and "delete my data" would be a lie
     * (F08 R19, R25).
     *
     * It is also null for every row written before F08 existed.
     */
    #[ORM\ManyToOne]
    #[ORM\JoinColumn(name: 'player_id', nullable: true, onDelete: 'SET NULL')]
    private ?Player $player = null;

    /**
     * Sized to a reward name, not to the slice label it used to copy (F26).
     *
     * The slice's 40 characters went with F26, so this follows the
     * catalogue's limit. Leaving it at 40 would be the fault
     * widenRewardValue() already fixed for amounts, in the other direction:
     * a long prize name would fail the insert on a strict database and
     * truncate the record of what somebody won on a lenient one.
     */
    #[ORM\Column(name: 'prize_name', length: Reward::NAME_MAX_LENGTH)]
    private string $prizeName;

    #[ORM\Column(name: 'prize_probability', type: 'smallint')]
    private int $prizeProbability;

    /**
     * The reward, by value (F13 R25).
     *
     * Four denormalised columns on one row will look like duplication to
     * whoever reads this schema next. It is the same decision as the prize
     * snapshot above, for the same reason: the log is a record of what
     * happened, and a record that changes when somebody edits a dropdown is
     * not a record. The player is the one exception, referenced rather than
     * copied so that deleting them means something (F08 R25).
     */
    #[ORM\Column(name: 'reward_type', length: 20)]
    private string $rewardType;

    /**
     * Integer, not smallint, and for a sharper reason than the catalogue's
     * own column (F21 R1): this one is written while a player is standing
     * at the wheel. A value the column could not hold would be a 500 in
     * the middle of a spin, on a strict database, for a prize the admin was
     * allowed to configure.
     */
    #[ORM\Column(name: 'reward_value', type: 'integer', nullable: true)]
    private ?int $rewardValue = null;

    /**
     * F13 R16–R18 with F16 R1. Unique across every spin ever recorded,
     * which the index — not the generator — is what actually guarantees.
     *
     * Null for a losing spin, which has nothing to claim, and for the
     * free-product spins recorded before F16, which are deliberately left
     * as they are (F16 R5): a code invented after the fact matches nothing
     * the player was ever shown.
     */
    #[ORM\Column(name: 'reward_code', length: 12, nullable: true, unique: true)]
    private ?string $rewardCode = null;

    /** F13 R21: null until somebody at the counter says otherwise. */
    #[ORM\Column(name: 'claimed_at', nullable: true)]
    private ?\DateTimeImmutable $claimedAt = null;

    #[ORM\Column(name: 'spun_at')]
    private \DateTimeImmutable $spunAt;

    public function __construct(Prize $prize, ?Player $player = null)
    {
        $this->prize = $prize;
        $this->player = $player;
        // F26 R6: still a snapshot. The label now comes from the reward, so
        // renaming that reward tomorrow must not rewrite what this player was
        // told they had won today.
        $this->prizeName = $prize->getLabel();
        $this->prizeProbability = $prize->getProbability();

        $reward = $prize->getReward();
        $this->rewardType = ($reward?->getType() ?? RewardType::FreeProduct)->value;
        $this->rewardValue = $reward?->getValue();
        $this->spunAt = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getPrize(): ?Prize
    {
        return $this->prize;
    }

    public function getPlayer(): ?Player
    {
        return $this->player;
    }

    public function getPrizeName(): string
    {
        return $this->prizeName;
    }

    public function getPrizeProbability(): int
    {
        return $this->prizeProbability;
    }

    public function getSpunAt(): \DateTimeImmutable
    {
        return $this->spunAt;
    }

    public function getRewardType(): RewardType
    {
        return RewardType::fromStorage($this->rewardType);
    }

    public function getRewardValue(): ?int
    {
        return $this->rewardValue;
    }

    public function getRewardCode(): ?string
    {
        return $this->rewardCode;
    }

    public function setRewardCode(string $code): void
    {
        $this->rewardCode = $code;
    }

    public function getClaimedAt(): ?\DateTimeImmutable
    {
        return $this->claimedAt;
    }

    public function isClaimed(): bool
    {
        return null !== $this->claimedAt;
    }

    /** F13 R15, R24: a losing item is never claimed. */
    public function isClaimable(): bool
    {
        return $this->getRewardType()->isClaimable();
    }

    /**
     * F13 R23. Idempotent on the way in: claiming something already claimed
     * keeps the original moment rather than quietly moving it, so a second
     * tap at the counter cannot rewrite when it happened.
     */
    public function setClaimed(bool $claimed): void
    {
        if (!$claimed) {
            $this->claimedAt = null;

            return;
        }

        $this->claimedAt ??= new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
    }
}
