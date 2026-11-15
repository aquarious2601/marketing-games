<?php

declare(strict_types=1);

namespace App\Wheel;

use App\Entity\Prize;
use App\Entity\Wheel;
use App\Repository\WheelRepository;
use App\Reward\RewardProvider;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Contracts\Translation\TranslatorInterface;

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
     * wheel ships with the toggle on (F13 R11): it has had a "Try again"
     * slice since F01, and removing it to satisfy a column default would
     * change a game nobody asked to change.
     *
     * The labels are the slices' own (F13 R8). The first reads "Try again"
     * while its reward is called "Maybe next time" — the clearest worked
     * example of why the two are separate things.
     *
     * @var list<int>
     */
    private const DEFAULT_PROBABILITIES = [40, 25, 15, 10, 7, 3];

    public function __construct(
        private readonly WheelRepository $wheels,
        private readonly EntityManagerInterface $entityManager,
        private readonly RewardProvider $rewards,
        private readonly TranslatorInterface $translator,
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
            $reward = $rewards[$position];
            $label = 0 === $position
                ? $this->translator->trans('wheel.default_losing_label')
                : $reward->getName();

            $wheel->addPrize(new Prize($label, $probability, $position, $reward));
        }

        $this->entityManager->persist($wheel);
        $this->entityManager->flush();

        return $wheel;
    }
}
