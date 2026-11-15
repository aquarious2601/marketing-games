<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\WheelRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

/**
 * The single wheel configuration (F01 R2).
 *
 * This row carries almost nothing today. It exists so that scheduling and
 * multiple campaigns can later hang off a wheel without having to reshape the
 * prize table, which by then will be referenced by spin records.
 */
#[ORM\Entity(repositoryClass: WheelRepository::class)]
#[ORM\Table(name: 'wheel')]
class Wheel
{
    /** F01 R1 */
    public const MIN_PRIZES = 2;

    /** F01 R1 */
    public const MAX_PRIZES = 12;

    /** F01 R8 */
    public const REQUIRED_TOTAL_PROBABILITY = 100;

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(name: 'updated_at')]
    private \DateTimeImmutable $updatedAt;

    /**
     * F13 R11. Off by default: a new wheel is all prizes until somebody
     * decides otherwise, which is the friendlier of the two defaults for a
     * shop setting up its first campaign.
     */
    #[ORM\Column(name: 'includes_losing_slice', options: ['default' => false])]
    private bool $includesLosingSlice = false;

    /**
     * Ordered by position (F01 R7), so every reader sees the same order
     * without having to remember to sort.
     *
     * @var Collection<int, Prize>
     */
    #[ORM\OneToMany(
        targetEntity: Prize::class,
        mappedBy: 'wheel',
        cascade: ['persist', 'remove'],
        orphanRemoval: true,
    )]
    #[ORM\OrderBy(['position' => 'ASC'])]
    private Collection $prizes;

    public function __construct()
    {
        $this->prizes = new ArrayCollection();
        $this->updatedAt = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    /** F13 R11. */
    public function includesLosingSlice(): bool
    {
        return $this->includesLosingSlice;
    }

    public function setIncludesLosingSlice(bool $includes): void
    {
        $this->includesLosingSlice = $includes;
    }

    public function touch(): void
    {
        $this->updatedAt = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
    }

    /**
     * @return Collection<int, Prize>
     */
    public function getPrizes(): Collection
    {
        return $this->prizes;
    }

    public function addPrize(Prize $prize): void
    {
        if (!$this->prizes->contains($prize)) {
            $this->prizes->add($prize);
            $prize->setWheel($this);
        }
    }

    public function removePrize(Prize $prize): void
    {
        $this->prizes->removeElement($prize);
    }

    public function getTotalProbability(): int
    {
        $total = 0;

        foreach ($this->prizes as $prize) {
            $total += $prize->getProbability();
        }

        return $total;
    }
}
