<?php

declare(strict_types=1);

namespace App\Tests\Wheel;

use App\Entity\Prize;
use App\Entity\Reward;
use App\Entity\Wheel;
use App\Reward\RewardType;
use App\Wheel\PrizeDraw;
use PHPUnit\Framework\TestCase;

/**
 * The draw is the one place where the game can quietly cheat the business or
 * the player, so it is tested both exactly (which boundary picks which prize)
 * and statistically (does the long run match the configured odds).
 */
final class PrizeDrawTest extends TestCase
{
    /**
     * @param list<array{string, int}> $prizes
     */
    private function wheelOf(array $prizes): Wheel
    {
        $wheel = new Wheel();

        foreach ($prizes as $position => [$name, $probability]) {
            // F26 R1: the name a slice is known by lives on its reward now,
            // so these tests hang one off each slice to draw with. Nothing
            // here touches a database; they are throwaway objects.
            $wheel->addPrize(new Prize(
                $probability,
                $position,
                new Reward($name, RewardType::FreeProduct),
            ));
        }

        return $wheel;
    }

    /** A draw whose random pick is fixed, so the mapping can be asserted exactly. */
    private function drawPicking(int ...$picks): PrizeDraw
    {
        return new class(...$picks) extends PrizeDraw {
            /** @var list<int> */
            private array $picks;

            public function __construct(int ...$picks)
            {
                $this->picks = $picks;
            }

            protected function pick(int $total): int
            {
                $next = array_shift($this->picks);

                if (null === $next) {
                    throw new \LogicException('The draw asked for more picks than the test supplied.');
                }

                return $next;
            }
        };
    }

    /**
     * F02 R5. The cumulative ranges for 60/30/10 are 1–60, 61–90, 91–100;
     * every boundary is checked because an off-by-one here silently shifts
     * the odds of every prize on the wheel.
     */
    public function testEachPickLandsInTheRightBand(): void
    {
        $wheel = $this->wheelOf([['A', 60], ['B', 30], ['C', 10]]);

        $expectations = [
            1 => 'A', 60 => 'A',
            61 => 'B', 90 => 'B',
            91 => 'C', 100 => 'C',
        ];

        foreach ($expectations as $pick => $expected) {
            self::assertSame(
                $expected,
                $this->drawPicking($pick)->draw($wheel)->getLabel(),
                sprintf('A pick of %d should win %s.', $pick, $expected),
            );
        }
    }

    public function testItCanDrawTheFirstAndLastPrize(): void
    {
        $wheel = $this->wheelOf([['First', 50], ['Last', 50]]);

        self::assertSame('First', $this->drawPicking(1)->draw($wheel)->getLabel());
        self::assertSame('Last', $this->drawPicking(100)->draw($wheel)->getLabel());
    }

    /** F02 R7 */
    public function testItBoundsTheDrawByTheActualTotalNotByOneHundred(): void
    {
        // A wheel edited outside the app, totalling 50 rather than 100.
        $wheel = $this->wheelOf([['A', 20], ['B', 30]]);

        $draw = new class extends PrizeDraw {
            public int $seenTotal = 0;

            protected function pick(int $total): int
            {
                $this->seenTotal = $total;

                return $total;
            }
        };

        self::assertSame('B', $draw->draw($wheel)->getLabel());
        self::assertSame(50, $draw->seenTotal, 'The draw should be bounded by the stored total.');
    }

    public function testItRefusesAWheelWithNoPrizes(): void
    {
        $this->expectException(\LogicException::class);

        (new PrizeDraw())->draw(new Wheel());
    }

    public function testItRefusesAWheelWhoseProbabilitiesAreAllZero(): void
    {
        $wheel = $this->wheelOf([['A', 0], ['B', 0]]);

        $this->expectException(\LogicException::class);

        (new PrizeDraw())->draw($wheel);
    }

    /**
     * F02 R8. The real random source, run enough times that a mis-weighted
     * draw would show up.
     *
     * The tolerance is deliberately loose: this must catch a prize being
     * drawn at twice or half its rate, not flag ordinary variance. With
     * 20,000 draws the standard error on a 10% prize is about 0.2 points, so
     * 3 points is far outside anything chance will produce, and the test will
     * not flake.
     */
    public function testTheLongRunMatchesTheConfiguredOdds(): void
    {
        $configured = ['Common' => 70, 'Occasional' => 25, 'Rare' => 5];
        $wheel = $this->wheelOf(array_map(
            static fn (string $name, int $p): array => [$name, $p],
            array_keys($configured),
            array_values($configured),
        ));

        $draw = new PrizeDraw();
        $draws = 20_000;
        $counts = array_fill_keys(array_keys($configured), 0);

        for ($i = 0; $i < $draws; ++$i) {
            ++$counts[$draw->draw($wheel)->getLabel()];
        }

        foreach ($configured as $name => $expectedPercent) {
            $actualPercent = 100 * $counts[$name] / $draws;

            self::assertEqualsWithDelta(
                $expectedPercent,
                $actualPercent,
                3.0,
                sprintf('%s was drawn %.2f%% of the time but is configured at %d%%.', $name, $actualPercent, $expectedPercent),
            );
        }
    }

    /** F02 R6 — a predictable sequence would let a player wait for the jackpot. */
    public function testConsecutiveDrawsAreNotIdentical(): void
    {
        $wheel = $this->wheelOf([['A', 50], ['B', 50]]);
        $draw = new PrizeDraw();

        $results = [];

        for ($i = 0; $i < 40; ++$i) {
            $results[] = $draw->draw($wheel)->getLabel();
        }

        self::assertGreaterThan(
            1,
            \count(array_unique($results)),
            'Forty draws on a 50/50 wheel returning one prize means the draw is not random.',
        );
    }
}
