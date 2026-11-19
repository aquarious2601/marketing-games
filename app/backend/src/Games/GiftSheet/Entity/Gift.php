<?php

declare(strict_types=1);

namespace App\Games\GiftSheet\Entity;

use App\Entity\Game;
use App\Entity\Reward;
use App\Games\GiftSheet\Repository\GiftRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * One reward on a sheet (F28 R1).
 *
 * Not a Prize with its probability left null: a slice and a gift are the same
 * shape by accident and different things in fact. A slice's odds are the
 * whole point of a wheel; a gift has none, and every player gets every gift
 * on the sheet (R10). Sharing a table would mean every query about either
 * had to say which kind it meant.
 *
 * The two unique indexes are the rules, held where a form cannot forget
 * them: a reward appears on a sheet at most once (R2), and no two gifts hold
 * the same place in the order (R6).
 */
#[ORM\Entity(repositoryClass: GiftRepository::class)]
#[ORM\Table(name: 'gift')]
#[ORM\UniqueConstraint(name: 'uniq_gift_game_reward', columns: ['game_id', 'reward_id'])]
#[ORM\UniqueConstraint(name: 'uniq_gift_game_position', columns: ['game_id', 'position'])]
class Gift
{
    /**
     * F28 R3. One, because a game that gives nothing is a mistake rather
     * than a setting; six, because the whole sheet and its codes have to fit
     * a 375px screen without scrolling, and six is what fits.
     */
    public const MIN_PER_SHEET = 1;
    public const MAX_PER_SHEET = 6;

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Game::class)]
    #[ORM\JoinColumn(name: 'game_id', nullable: false, onDelete: 'CASCADE')]
    private ?Game $game = null;

    /**
     * F28 R4. A gift takes its reward's name, exactly as a slice does
     * (F26 R1), so there is no second label to type and none to keep in step.
     */
    #[ORM\ManyToOne(targetEntity: Reward::class)]
    #[ORM\JoinColumn(name: 'reward_id', nullable: false)]
    private ?Reward $reward = null;

    /** 0-based, and the order the player reads (F28 R6). */
    #[ORM\Column(type: 'smallint')]
    private int $position;

    public function __construct(Game $game, Reward $reward, int $position)
    {
        $this->game = $game;
        $this->reward = $reward;
        $this->position = $position;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getGame(): Game
    {
        return $this->game ?? throw new \LogicException('A gift always belongs to a game (F28 R1).');
    }

    public function getReward(): Reward
    {
        return $this->reward ?? throw new \LogicException('A gift always gives a reward (F28 R1).');
    }

    /** F28 R4: the gift's name is its reward's name. */
    public function getLabel(): string
    {
        return $this->getReward()->getName();
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
