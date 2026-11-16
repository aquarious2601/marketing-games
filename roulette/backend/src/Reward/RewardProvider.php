<?php

declare(strict_types=1);

namespace App\Reward;

use App\Entity\Reward;
use App\Repository\RewardRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * The catalogue the first wheel is built from (F13 R1, F01 R2).
 *
 * The default wheel has always shipped with six slices so the admin page is
 * never an empty form; now each of those needs something to point at. The
 * six below are deliberately one of each kind — a losing item, two
 * percentages, three free products — so the first thing an admin sees is a
 * worked example of what the catalogue is for.
 *
 * Names are created in the admin's language and are then theirs to edit.
 * That is a deliberate exception to F12 R10: a *default* is the
 * application's own words, in the way the default tagline is (F12 R11), and
 * a Vietnamese shop should not have to translate six rows before starting.
 * Once created they are stored content and nothing translates them again.
 */
final class RewardProvider
{
    /**
     * @var list<array{key: string, type: RewardType, value: int|null}>
     */
    private const DEFAULTS = [
        ['key' => 'reward.default_losing', 'type' => RewardType::Nothing, 'value' => null],
        ['key' => 'reward.default_5_percent', 'type' => RewardType::PercentOff, 'value' => 5],
        ['key' => 'reward.default_10_percent', 'type' => RewardType::PercentOff, 'value' => 10],
        ['key' => 'reward.default_free_sample', 'type' => RewardType::FreeProduct, 'value' => null],
        ['key' => 'reward.default_free_gift', 'type' => RewardType::FreeProduct, 'value' => null],
        ['key' => 'reward.default_grand_prize', 'type' => RewardType::FreeProduct, 'value' => null],
    ];

    public function __construct(
        private readonly RewardRepository $rewards,
        private readonly EntityManagerInterface $entityManager,
        private readonly TranslatorInterface $translator,
    ) {
    }

    /**
     * The same six, for code that cannot go through the entity manager
     * (P02 R7). The upgrade command seeds the catalogue with raw SQL,
     * because it runs while the schema is half-changed and the ORM's idea
     * of the tables is not yet the database's — but it must seed *these*
     * six, so the list has one home.
     *
     * @return list<array{key: string, type: RewardType, value: int|null}>
     */
    public static function defaultSpecifications(): array
    {
        return self::DEFAULTS;
    }

    /**
     * The six defaults, created once and returned in order.
     *
     * Persisted but not flushed: the caller is building a wheel in the same
     * unit of work, and flushing here would leave a catalogue behind if the
     * wheel then failed to save.
     *
     * @return list<Reward>
     */
    public function defaults(): array
    {
        $created = [];

        foreach (self::DEFAULTS as $specification) {
            $name = $this->translator->trans($specification['key']);
            $existing = $this->rewards->findByName($name);

            if (null !== $existing) {
                $created[] = $existing;

                continue;
            }

            $reward = new Reward($name, $specification['type'], $specification['value']);
            $this->entityManager->persist($reward);

            $created[] = $reward;
        }

        return $created;
    }

    /**
     * The reward a losing slice points at (F13 R12).
     *
     * Looked up by type rather than by name, so an admin who renamed it to
     * "Better luck next time" still gets theirs back rather than a second
     * one appearing beside it.
     */
    public function losing(): Reward
    {
        return $this->rewards->losingReward($this->translator->trans(Reward::DEFAULT_LOSING_KEY));
    }
}
