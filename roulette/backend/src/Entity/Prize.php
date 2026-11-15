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
    /** F01 R4 */
    public const NAME_MAX_LENGTH = 40;

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

    #[ORM\Column(length: self::NAME_MAX_LENGTH)]
    private string $name;

    #[ORM\Column(type: 'smallint')]
    private int $probability;

    #[ORM\Column(type: 'smallint')]
    private int $position;

    public function __construct(string $name, int $probability, int $position)
    {
        $this->name = $name;
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

    public function getName(): string
    {
        return $this->name;
    }

    public function setName(string $name): void
    {
        $this->name = $name;
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
