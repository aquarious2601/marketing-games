<?php

declare(strict_types=1);

namespace App\Wheel;

use App\Entity\Prize;
use App\Entity\Wheel;
use App\Repository\WheelRepository;
use App\Reward\RewardProvider;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Hands out the one wheel, creating a sensible default the first time
 * (F01 R2), so the admin page is never an empty form that cannot be saved.
 */
final class WheelProvider
{
    /**
     * Totals 100 (F01 R8), so the default configuration is immediately valid
     * and the admin can save after a single edit.
     *
     * The order matches RewardProvider::DEFAULTS, so slice *n* points at
     * default reward *n*. The first is the losing one, which is why this
     * wheel ships with the toggle on (F13 R11): it has had a losing slice
     * since F01, and removing it to satisfy a column default would change a
     * game nobody asked to change.
     *
     * Every slice reads its reward's name (F26 R1). Until F26 the first one
     * said "Try again" while the reward behind it was called "Maybe next
     * time" — two default strings for one thing, which was offered as the
     * worked example of why a slice kept a label of its own and turned out
     * to be the only example anybody had.
     *
     * @var list<int>
     */
    private const DEFAULT_PROBABILITIES = [40, 25, 15, 10, 7, 3];

    public function __construct(
        private readonly WheelRepository $wheels,
        private readonly EntityManagerInterface $entityManager,
        private readonly RewardProvider $rewards,
    ) {
    }

    public function getOrCreate(): Wheel
    {
        $wheel = $this->wheels->findTheWheel();

        if ($wheel instanceof Wheel) {
            return $wheel;
        }

        $wheel = new Wheel();
        $wheel->setIncludesLosingSlice(true);

        $rewards = $this->rewards->defaults();

        foreach (self::DEFAULT_PROBABILITIES as $position => $probability) {
            // F26 R1, R5: there is no label to choose, the losing slice
            // included. Every slice reads whatever RewardProvider called the
            // reward behind it, which is where the wording lives now — so
            // position 0 no longer gets a second losing label of its own.
            $wheel->addPrize(new Prize($probability, $position, $rewards[$position]));
        }

        $this->entityManager->persist($wheel);
        $this->entityManager->flush();

        return $wheel;
    }
}
