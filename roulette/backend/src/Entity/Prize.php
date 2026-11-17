<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\PrizeRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * One slice of the wheel.
 *
 * A prize keeps its id across saves (F01 R11) so that spin records written by
 * later features still point at something meaningful after the admin edits
 * the wheel.
 */
#[ORM\Entity(repositoryClass: PrizeRepository::class)]
#[ORM\Table(name: 'prize')]
#[ORM\UniqueConstraint(name: 'uniq_prize_wheel_position', columns: ['wheel_id', 'position'])]
class Prize
{
    /** F01 R5 */
    public const MIN_PROBABILITY = 1;

    /** F01 R5 */
    public const MAX_PROBABILITY = 100;

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(inversedBy: 'prizes')]
    #[ORM\JoinColumn(name: 'wheel_id', nullable: false, onDelete: 'CASCADE')]
    private ?Wheel $wheel = null;

    /**
     * What this slice gives away (F13 R7).
     *
     * RESTRICT, not SET NULL — the opposite of how spin.prize_id behaves
     * (F02 R11), and deliberately. A spin is history and must survive its
     * prize being deleted; a slice is configuration and must never exist
     * pointing at nothing.
     */
    #[ORM\ManyToOne]
    #[ORM\JoinColumn(name: 'reward_id', nullable: false, onDelete: 'RESTRICT')]
    private ?Reward $reward = null;

    #[ORM\Column(type: 'smallint')]
    private int $probability;

    #[ORM\Column(type: 'smallint')]
    private int $position;

    public function __construct(int $probability, int $position, ?Reward $reward = null)
    {
        $this->reward = $reward;
        $this->probability = $probability;
        $this->position = $position;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getWheel(): ?Wheel
    {
        return $this->wheel;
    }

    public function setWheel(?Wheel $wheel): void
    {
        $this->wheel = $wheel;
    }

    public function getReward(): ?Reward
    {
        return $this->reward;
    }

    public function setReward(Reward $reward): void
    {
        $this->reward = $reward;
    }

    /**
     * What this slice says, which is what it gives (F26 R1).
     *
     * Not stored. F13 R8 kept a label on the slice so that one reward could
     * read differently on two of them; F26 took that away, so the only name
     * is the reward's and the two cannot drift apart.
     *
     * The reward is `NOT NULL` in the database and `RESTRICT` on delete, so
     * the throw is unreachable rather than defensive — it states F26 R3
     * instead of handing a wheel an empty slice to draw.
     */
    public function getLabel(): string
    {
        return $this->reward?->getName()
            ?? throw new \LogicException('A slice with no reward has no label (F26 R3).');
    }

    public function getProbability(): int
    {
        return $this->probability;
    }

    public function setProbability(int $probability): void
    {
        $this->probability = $probability;
    }

    public function getPosition(): int
    {
        return $this->position;
    }

    public function setPosition(int $position): void
    {
        $this->position = $position;
    }
}
