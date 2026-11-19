<?php

declare(strict_types=1);

namespace App\Reward;

use App\Entity\Reward;
use App\Store\StoreProvider;

/**
 * What handing a reward over costs the shop (F32 R1–R7).
 *
 * One place, because the answer depends on the reward's *type* and that is
 * exactly the kind of rule that gets written twice and then disagrees: the
 * wheel's recorder and the gift sheet's issuer both ask this, and the
 * upgrade asks it again when it prices the spins already recorded.
 *
 * Null everywhere means **unpriced**, which is not zero (R7). A reward that
 * genuinely costs nothing is a zero somebody typed; a reward nobody has
 * priced is a win the stats count and decline to total.
 */
final class RewardCost
{
    public function __construct(private readonly StoreProvider $store)
    {
    }

    /**
     * The cost to snapshot onto a spin of this reward, right now.
     *
     * A percentage is the one type whose cost is not simply read off the
     * reward: a percentage of nothing is nothing, so it is taken as a
     * percentage of the store's average basket (R6). Where an admin has
     * typed a cost on one anyway, that wins — they know what a fifth of
     * their own baskets comes to better than an average does, and a field
     * the form offers and the system ignores would be worse than either
     * rule alone. See F32 section 13.
     */
    public function of(?Reward $reward): ?int
    {
        if (null === $reward) {
            return null;
        }

        // R4. Nothing is handed over, so nothing is spent.
        if (RewardType::Nothing === $reward->getType()) {
            return null;
        }

        $typed = $reward->getCost();

        if (null !== $typed) {
            return $typed;
        }

        return RewardType::PercentOff === $reward->getType()
            ? $this->percentageOfABasket($reward)
            : null;
    }

    /**
     * R6. With no average basket there is nothing to take a percentage of,
     * and the win is unpriced rather than free.
     *
     * Rounded rather than truncated, and to whole minor units, because a
     * cost is money and money in this application is always an integer
     * number of the currency's smallest unit (F21).
     */
    private function percentageOfABasket(Reward $reward): ?int
    {
        $basket = $this->store->getOrCreate()->getAverageBasket();
        $percentage = $reward->getValue();

        if (null === $basket || null === $percentage) {
            return null;
        }

        return (int) round($basket * $percentage / 100);
    }
}
