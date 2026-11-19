<?php

declare(strict_types=1);

namespace App\Repository;

use App\Games\Wheel\Entity\Prize;
use App\Entity\Reward;
use App\Reward\RewardType;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Reward>
 */
final class RewardRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Reward::class);
    }

    /**
     * The catalogue, oldest first.
     *
     * Insertion order rather than alphabetical: the admin builds a list and
     * expects it to stay where they put it, and a reward renamed from
     * "Voucher" to "A voucher" jumping to the top is the kind of movement
     * that makes a screen feel unreliable.
     *
     * @return list<Reward>
     */
    public function listAll(): array
    {
        /** @var list<Reward> $rewards */
        $rewards = $this->createQueryBuilder('r')
            ->orderBy('r.id', 'ASC')
            ->getQuery()
            ->getResult();

        return $rewards;
    }

    public function findByName(string $name): ?Reward
    {
        return $this->findOneBy(['name' => $name]);
    }

    /**
     * Which slices use a reward, by their place on the wheel (F13 R6).
     *
     * Positions rather than a count, for the reason F13 R6 gave: the refusal
     * has to name what is in the way, because "it is on the wheel" leaves the
     * admin hunting. It used to name the slices' labels, which F26 took away
     * — and a label would now be the reward's own name, so "Bon d'achat 10€
     * is used by Bon d'achat 10€" would be the best it could do.
     *
     * Counted from 1, because that is how an admin counts the rows in front
     * of them. `prize.position` counts from 0.
     *
     * @return list<int>
     */
    public function slicePositionsUsing(Reward $reward): array
    {
        /** @var list<array{position: int}> $rows */
        $rows = $this->getEntityManager()
            ->createQueryBuilder()
            ->select('p.position')
            ->from(Prize::class, 'p')
            ->where('p.reward = :reward')
            ->setParameter('reward', $reward)
            ->orderBy('p.position', 'ASC')
            ->getQuery()
            ->getResult();

        return array_map(
            static fn (array $row): int => $row['position'] + 1,
            $rows,
        );
    }

    /**
     * The reward a losing slice points at (F13 R12), created on first use.
     *
     * There is one of these rather than one per wheel: a losing item says
     * the same thing whatever campaign is running, and a catalogue filling
     * up with identical "nothing" rows would be its own small mess.
     */
    public function losingReward(string $defaultName): Reward
    {
        $existing = $this->findOneBy(['type' => RewardType::Nothing->value]);

        if (null !== $existing) {
            return $existing;
        }

        $reward = new Reward($this->freeName($defaultName), RewardType::Nothing);

        $this->getEntityManager()->persist($reward);

        return $reward;
    }

    /**
     * A name nothing else is using.
     *
     * Only reachable when the admin has already made a reward called "Maybe
     * next time" themselves; without this, turning the toggle on would fail
     * on the unique index with an error about nothing they did.
     */
    private function freeName(string $preferred): string
    {
        if (null === $this->findByName($preferred)) {
            return $preferred;
        }

        for ($suffix = 2; $suffix < 100; ++$suffix) {
            $candidate = sprintf('%s (%d)', $preferred, $suffix);

            if (null === $this->findByName($candidate)) {
                return $candidate;
            }
        }

        return $preferred.' '.bin2hex(random_bytes(3));
    }
}
