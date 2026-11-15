<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\SpinRepository;
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

    #[ORM\Column(name: 'prize_name', length: Prize::NAME_MAX_LENGTH)]
    private string $prizeName;

    #[ORM\Column(name: 'prize_probability', type: 'smallint')]
    private int $prizeProbability;

    #[ORM\Column(name: 'spun_at')]
    private \DateTimeImmutable $spunAt;

    public function __construct(Prize $prize, ?Player $player = null)
    {
        $this->prize = $prize;
        $this->player = $player;
        $this->prizeName = $prize->getName();
        $this->prizeProbability = $prize->getProbability();
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
}
