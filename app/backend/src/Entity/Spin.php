<?php

declare(strict_types=1);

namespace App\Entity;

use App\Games\GiftSheet\Entity\Gift;
use App\Games\Wheel\Entity\Prize;
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

    /**
     * How likely the slice was, or null for a gift (F28 §7): a sheet hands
     * over everything on it, so there is nothing to have been likely.
     *
     * The mapping has to say `nullable` as well as the type: a `?int`
     * property with a non-null column is a mismatch Doctrine's diff does not
     * report, and the first gift row would be refused by a strict database
     * (which production is and this machine is not).
     */
    #[ORM\Column(name: 'prize_probability', type: 'smallint', nullable: true)]
    private ?int $prizeProbability = null;

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
     * F32 R8, R9, R10. What this win cost the shop, worked out at the
     * moment it was won.
     *
     * A snapshot beside the type and the value, for the same reason those
     * are snapshots: correcting a price next month must not restate last
     * month's figures. A number an owner read on Monday has to still be
     * that number on Friday.
     *
     * Null is unpriced and stays unpriced (R10) — a cost filled in later
     * would otherwise appear retrospectively on a prize already handed
     * over.
     */
    #[ORM\Column(name: 'reward_cost', type: 'integer', nullable: true)]
    private ?int $rewardCost = null;

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

    /**
     * F31 R19. Who handed it over, beside when.
     *
     * `SET NULL` rather than `CASCADE`: an account that leaves the shop must
     * not take the record of the prizes it handed over with it. Null also
     * covers every claim made before F31, which was a moment with no author
     * (R22) — and the two cases are deliberately the same value, because
     * neither can name anybody and inventing a name is the one thing a
     * column built to settle a dispute must never do.
     */
    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'claimed_by_id', nullable: true, onDelete: 'SET NULL')]
    private ?User $claimedBy = null;

    /**
     * F27 R9. Recorded rather than read through the prize, so the log still
     * says where a spin came from after a game is turned off or another is
     * added beside it.
     */
    #[ORM\ManyToOne(targetEntity: Game::class)]
    #[ORM\JoinColumn(name: 'game_id', nullable: false, onDelete: 'CASCADE')]
    private ?Game $game = null;

    /**
     * The sheet this row was part of (F28 R19), or null for a wheel spin.
     *
     * One value shared by a sheet's rows, so "how many sheets today" is a
     * count and "the same sheet again" is a lookup rather than a guess from
     * timestamps — which would group two sheets issued in the same second.
     */
    #[ORM\Column(name: 'sheet_id', length: 12, nullable: true)]
    private ?string $sheetId = null;

    #[ORM\Column(name: 'spun_at')]
    private \DateTimeImmutable $spunAt;

    /**
     * Private since F28: a row is either a slice that was drawn or a gift
     * that was handed over, and the two have different invariants — a spin
     * has a prize and a probability, a gift has neither and has a sheet
     * instead. One constructor taking both could not say what it required.
     *
     * Doctrine instantiates entities without calling this, so hydration is
     * unaffected.
     */
    private function __construct()
    {
        $this->spunAt = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
    }

    /** One play of the wheel (F02 R9). */
    public static function forPrize(Prize $prize, ?Player $player = null): self
    {
        $spin = new self();

        $spin->prize = $prize;
        $spin->player = $player;
        // F26 R6: still a snapshot. The label now comes from the reward, so
        // renaming that reward tomorrow must not rewrite what this player was
        // told they had won today.
        $spin->prizeName = $prize->getLabel();
        $spin->prizeProbability = $prize->getProbability();

        $reward = $prize->getReward();
        $spin->rewardType = ($reward?->getType() ?? RewardType::FreeProduct)->value;
        $spin->rewardValue = $reward?->getValue();

        return $spin;
    }

    /**
     * One gift from a sheet (F28 R12).
     *
     * No prize and no probability: a gift was not drawn — the sheet hands
     * over everything on it (R10) — so the column says null rather than a
     * number that would read as odds.
     */
    public static function forGift(Gift $gift, Player $player): self
    {
        $spin = new self();

        $spin->player = $player;
        // F28 R4: a gift's name is its reward's name, snapshotted here for
        // the same reason a slice's is (F26 R6).
        $spin->prizeName = $gift->getLabel();

        $reward = $gift->getReward();
        $spin->rewardType = $reward->getType()->value;
        $spin->rewardValue = $reward->getValue();

        return $spin;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    /** F28 R19. Null for a wheel spin. */
    public function getSheetId(): ?string
    {
        return $this->sheetId;
    }

    public function setSheetId(string $sheetId): void
    {
        $this->sheetId = $sheetId;
    }

    public function getGame(): Game
    {
        return $this->game ?? throw new \LogicException('A spin always records its game (F27 R9).');
    }

    public function setGame(Game $game): void
    {
        $this->game = $game;
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

    /** Null for a gift: it was handed over, not drawn (F28 R10). */
    public function getPrizeProbability(): ?int
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

    public function getRewardCost(): ?int
    {
        return $this->rewardCost;
    }

    /** F32 R8. Written once, by whoever records the spin. */
    public function setRewardCost(?int $cost): void
    {
        $this->rewardCost = $cost;
    }

    public function getClaimedBy(): ?User
    {
        return $this->claimedBy;
    }

    /**
     * F13 R23, F31 R19, R20. Idempotent on the way in: claiming something
     * already claimed keeps the original moment rather than quietly moving
     * it, so a second tap at the counter cannot rewrite when it happened —
     * and, since F31, cannot rewrite who did it either. The author belongs
     * to the hand-over, not to the last press.
     *
     * Un-claiming clears both (R20): an un-done claim did not happen, and a
     * time without an author is what a pre-F31 claim already looks like.
     */
    public function setClaimed(bool $claimed, ?User $by = null): void
    {
        if (!$claimed) {
            $this->claimedAt = null;
            $this->claimedBy = null;

            return;
        }

        if (null !== $this->claimedAt) {
            return;
        }

        $this->claimedAt = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        $this->claimedBy = $by;
    }
}
