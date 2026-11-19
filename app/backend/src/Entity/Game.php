<?php

declare(strict_types=1);

namespace App\Entity;

use App\Game\GameType;
use App\Game\LinkKey;
use App\Repository\GameRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * One promotion (F27 R3): a name, a type, what it gives away, how often one
 * person may play it, and its own link.
 *
 * Everything a game shows but does not decide — the company name, the logo,
 * the currency, the theme, the clock — belongs to the Store, because a shop
 * types those once and runs many promotions with them (F27 R10).
 *
 * The entity is shared rather than one game type's, since every type has
 * exactly this row. What differs between types hangs off it: a Wheel for
 * F27, a list of gifts for F28.
 */
#[ORM\Entity(repositoryClass: GameRepository::class)]
#[ORM\Table(name: 'game')]
#[ORM\UniqueConstraint(name: 'uniq_game_link_key', columns: ['link_key'])]
class Game
{
    public const NAME_MAX_LENGTH = 60;

    /** As the tagline it used to be on the campaign (F04 R28). */
    public const TAGLINE_MAX_LENGTH = 120;

    /** F23 R4's ceiling, now the game's rather than the campaign's. */
    public const MAX_DAILY_LIMIT = 99;

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Store::class)]
    #[ORM\JoinColumn(name: 'store_id', nullable: false, onDelete: 'CASCADE')]
    private ?Store $store = null;

    /**
     * Required, unlike the campaign name it comes from (F04 R3), because a
     * list of games needs something to call them (F27 R33).
     */
    #[ORM\Column(length: self::NAME_MAX_LENGTH)]
    private string $name;

    #[ORM\Column(length: 32)]
    private string $type;

    #[ORM\Column(length: self::TAGLINE_MAX_LENGTH, nullable: true)]
    private ?string $tagline = null;

    /**
     * How many times one person may play *this* game in a day (F27 R29, R30).
     * Null is no limit, which is what every campaign that predates F23 has.
     */
    #[ORM\Column(name: 'daily_limit', type: 'smallint', nullable: true)]
    private ?int $dailyLimit = null;

    /**
     * Minted once and never changed (F27 R21), so a printed poster survives
     * the game being turned off and on again.
     */
    #[ORM\Column(name: 'link_key', length: 16)]
    private string $linkKey;

    /**
     * F27 R22. A new game starts off, so a half-configured promotion is
     * never reachable by a link (R39).
     */
    #[ORM\Column(name: 'is_live', options: ['default' => false])]
    private bool $isLive = false;

    #[ORM\Column(name: 'created_at')]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(name: 'updated_at')]
    private \DateTimeImmutable $updatedAt;

    public function __construct(Store $store, string $name, GameType $type)
    {
        $this->store = $store;
        $this->name = $name;
        $this->type = $type->value;
        $this->linkKey = LinkKey::mint();
        $this->createdAt = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        $this->updatedAt = $this->createdAt;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getStore(): Store
    {
        return $this->store ?? throw new \LogicException('A game always belongs to a store (F27 R4).');
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function setName(string $name): void
    {
        $this->name = $name;
        $this->touch();
    }

    public function getType(): GameType
    {
        return GameType::fromStored($this->type);
    }

    /**
     * There is deliberately no setter. F27 R5: a type is chosen when a game
     * is created, and to change it you create another game.
     */
    public function is(GameType $type): bool
    {
        return $this->getType() === $type;
    }

    /** The admin's phrase, or the type's own default when they have written none. */
    public function getTagline(): string
    {
        return $this->tagline ?? $this->defaultTagline();
    }

    /** Null when the default is in use, which is what the admin form needs. */
    public function getOwnTagline(): ?string
    {
        return $this->tagline;
    }

    public function setTagline(?string $tagline): void
    {
        $this->tagline = $this->normalise($tagline);
        $this->touch();
    }

    public function getDailyLimit(): ?int
    {
        return $this->dailyLimit;
    }

    public function setDailyLimit(?int $limit): void
    {
        $this->dailyLimit = $limit;
        $this->touch();
    }

    public function getLinkKey(): string
    {
        return $this->linkKey;
    }

    public function isLive(): bool
    {
        return $this->isLive;
    }

    public function setLive(bool $live): void
    {
        $this->isLive = $live;
        $this->touch();
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    /**
     * F27 R12, F12 R11: the words the application supplies when the admin has
     * written none are about the game, so they cannot be one sentence for
     * every type — "One spin, one prize" is a lie on a sheet that gives
     * everything on it.
     *
     * A message key rather than a sentence, because these are the
     * application's own words and therefore ours to translate. The entity
     * cannot translate; the presenter can.
     */
    public function defaultTaglineKey(): string
    {
        return match ($this->getType()) {
            GameType::Wheel => 'tagline.default',
        };
    }

    private function defaultTagline(): string
    {
        return $this->defaultTaglineKey();
    }

    private function touch(): void
    {
        $this->updatedAt = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
    }

    private function normalise(?string $value): ?string
    {
        $trimmed = trim((string) $value);

        return '' === $trimmed ? null : $trimmed;
    }
}
