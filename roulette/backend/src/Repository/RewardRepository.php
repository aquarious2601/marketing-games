<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Prize;
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
     * The slices using a reward (F13 R6).
     *
     * Returned as the labels rather than a count, because the refusal has to
     * name what is in the way — "it is on the wheel" leaves the admin
     * hunting, "Lucky you! uses it" does not.
     *
     * @return list<string>
     */
    public function slicesUsing(Reward $reward): array
    {
        /** @var list<array{name: string}> $rows */
        $rows = $this->getEntityManager()
            ->createQueryBuilder()
            ->select('p.name')
            ->from(Prize::class, 'p')
            ->where('p.reward = :reward')
            ->setParameter('reward', $reward)
            ->orderBy('p.position', 'ASC')
            ->getQuery()
            ->getResult();

        return array_column($rows, 'name');
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
