<?php

declare(strict_types=1);

namespace App\Tests\Reward;

use App\Entity\Reward;
use App\Reward\RewardCost;
use App\Reward\RewardType;
use App\Store\StoreProvider;
use App\Tests\Support\DatabaseWebTestCase;

/**
 * F32 R1–R10: what a reward costs, and when that is decided.
 *
 * Against the real service and the real store row, because the interesting
 * half of these rules is the average basket — a figure that lives on the
 * store and that only a percentage reward reads.
 */
final class RewardCostTest extends DatabaseWebTestCase
{
    private RewardCost $costs;

    protected function setUp(): void
    {
        parent::setUp();

        $costs = static::getContainer()->get(RewardCost::class);
        self::assertInstanceOf(RewardCost::class, $costs);

        $this->costs = $costs;
    }

    /** F32 R1. A free product costs whatever the shop typed. */
    public function testAFreeProductCostsWhatItWasGiven(): void
    {
        $reward = new Reward('Free coffee', RewardType::FreeProduct);
        $reward->setCost(25_000);

        self::assertSame(25_000, $this->costs->of($reward));
    }

    /** F32 R7. Unpriced is not zero. */
    public function testARewardNobodyHasPricedIsUnpriced(): void
    {
        self::assertNull($this->costs->of(new Reward('Mystery gift', RewardType::FreeProduct)));
    }

    /** F32 R7. And a reward that genuinely costs nothing is a typed zero. */
    public function testAZeroIsACostSomebodyChose(): void
    {
        $reward = new Reward('A kind word', RewardType::FreeProduct);
        $reward->setCost(0);

        self::assertSame(0, $this->costs->of($reward));
    }

    /** F32 R6. A percentage of the shop's average basket. */
    public function testAPercentageIsPricedFromTheAverageBasket(): void
    {
        $this->givenAnAverageBasketOf(200_000);

        $reward = new Reward('Twenty per cent off', RewardType::PercentOff, 20);

        self::assertSame(40_000, $this->costs->of($reward));
    }

    /** F32 R6. With nothing to take a percentage of, it is unpriced. */
    public function testAPercentageWithNoBasketIsUnpriced(): void
    {
        $reward = new Reward('Twenty per cent off', RewardType::PercentOff, 20);

        self::assertNull($this->costs->of($reward), 'And not zero, which would read as free.');
    }

    /**
     * F32 R1 beside R6, as section 13 settles it: a typed cost wins.
     *
     * A shop that has worked out what a fifth of its own baskets comes to
     * knows better than an average does, and a field the form offers and the
     * system ignores would be worse than either rule alone.
     */
    public function testATypedCostBeatsTheBasket(): void
    {
        $this->givenAnAverageBasketOf(200_000);

        $reward = new Reward('Twenty per cent off', RewardType::PercentOff, 20);
        $reward->setCost(15_000);

        self::assertSame(15_000, $this->costs->of($reward));
    }

    /** F32 R4. Nothing is handed over, so nothing is spent. */
    public function testTheLosingRewardNeverHasACost(): void
    {
        $reward = new Reward('Maybe next time', RewardType::Nothing);
        $reward->setCost(25_000);

        self::assertNull($reward->getCost(), 'The entity refuses it.');
        self::assertNull($this->costs->of($reward), 'And so does the pricing.');
    }

    /** F32 R4. Changing the type to the losing one clears a cost it cannot carry. */
    public function testBecomingTheLosingRewardClearsItsCost(): void
    {
        $reward = new Reward('Free coffee', RewardType::FreeProduct);
        $reward->setCost(25_000);

        $reward->setType(RewardType::Nothing);

        self::assertNull($reward->getCost());
    }

    /** F32 R6. Rounded to whole minor units, because money is an integer. */
    public function testAPercentageRoundsToWholeMoney(): void
    {
        $this->givenAnAverageBasketOf(99_999);

        $reward = new Reward('Fifteen per cent off', RewardType::PercentOff, 15);

        // 14,999.85 — rounded, not truncated.
        self::assertSame(15_000, $this->costs->of($reward));
    }

    public function testNothingAtAllCostsNothingToPrice(): void
    {
        self::assertNull($this->costs->of(null));
    }

    private function givenAnAverageBasketOf(int $amount): void
    {
        $provider = static::getContainer()->get(StoreProvider::class);
        self::assertInstanceOf(StoreProvider::class, $provider);

        $provider->getOrCreate()->setAverageBasket($amount);
        $this->entityManager->flush();
    }
}
