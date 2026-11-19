<?php

declare(strict_types=1);

namespace App\Tests\Controller\Admin;

use App\Entity\Player;
use App\Games\Wheel\Entity\Prize;
use App\Entity\Reward;
use App\Entity\Spin;
use App\Games\Wheel\Entity\Wheel;
use App\Reward\RewardType;
use App\Tests\Support\DatabaseWebTestCase;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * F16 R7–R16: finding one spin at a counter.
 *
 * The rows are written here rather than spun for, which is the opposite of
 * what RewardIssueTest does and deliberately so. That test is about a code
 * being issued inside the recording transaction, which only a real spin
 * exercises; this one is about a query, and a query is best tested against
 * codes the test chose — `A7K3-M9PX` is in the feature file's acceptance
 * criteria, and a generated code could not be named there.
 */
final class SpinLookupTest extends DatabaseWebTestCase
{
    private const SPINS_URI = '/api/admin/spins';

    /** The code the acceptance criteria talk about. */
    private const CODE = 'A7K3-M9PX';


    /** F16 R7, R13 */
    public function testItFindsASpinByItsCode(): void
    {
        $this->givenASpin('Free coffee', self::CODE);
        $this->givenASpin('Ten off', 'B4C5-D6F7');

        $found = $this->search(self::CODE);

        self::assertCount(1, $found['spins']);
        self::assertSame(self::CODE, $found['spins'][0]['code']);
        self::assertSame('Free coffee', $found['spins'][0]['prizeName']);
    }

    /**
     * F16 R8. Every one of these is the same code as far as the counter is
     * concerned.
     *
     */
    #[DataProvider('carelesslyTyped')]
    public function testItFindsASpinHoweverTheCodeWasTyped(string $typed): void
    {
        $this->givenASpin('Free coffee', self::CODE);

        $found = $this->search($typed);

        self::assertCount(1, $found['spins'], sprintf('"%s" found nothing.', $typed));
        self::assertSame(self::CODE, $found['spins'][0]['code']);
    }

    /** @return iterable<string, array{string}> */
    public static function carelesslyTyped(): iterable
    {
        yield 'as issued' => [self::CODE];
        yield 'lower case' => ['a7k3-m9px'];
        yield 'without the hyphen' => ['a7k3m9px'];
        yield 'with a space instead' => ['A7K3 M9PX'];
        yield 'with trailing space' => ['A7K3-M9PX '];
        yield 'mixed case, no hyphen' => ['a7K3m9Px'];
    }

    /** F16 R9: the row arrives as the code is typed, not only at the end. */
    public function testItFindsASpinByTheStartOfItsCode(): void
    {
        $this->givenASpin('Free coffee', self::CODE);

        foreach (['A', 'A7', 'A7K', 'A7K3', 'A7K3-M', 'A7K3-M9P'] as $prefix) {
            $found = $this->search($prefix);

            self::assertCount(1, $found['spins'], sprintf('"%s" found nothing.', $prefix));
        }
    }

    /** F16 R13, R16: one row out of many, and a total that says so. */
    public function testACodeNarrowsTheLogToOneRow(): void
    {
        $this->givenASpin('Free coffee', self::CODE);

        foreach (['B4C5-D6F7', 'C5D6-F7G8', 'D6F7-G8H9'] as $other) {
            $this->givenASpin('Something else', $other);
        }

        self::assertSame(4, $this->search('')['total']);

        $found = $this->search(self::CODE);

        self::assertCount(1, $found['spins']);
        self::assertSame(1, $found['total']);
    }

    /** F16 R10: F09 R18's phone filter, untouched. */
    public function testAPhoneNumberStillFindsThatPlayersSpins(): void
    {
        $this->givenASpin('Free coffee', self::CODE, '0912345678');
        $this->givenASpin('Ten off', 'B4C5-D6F7', '0987654321');

        $found = $this->search('0987');

        self::assertCount(1, $found['spins']);
        self::assertSame('B4C5-D6F7', $found['spins'][0]['code']);
    }

    /**
     * F16 R11. The filter is one question — "which spin am I looking
     * for" — answered from either column.
     */
    public function testEitherColumnCanMatch(): void
    {
        $this->givenASpin('Free coffee', self::CODE, '0912345678');
        $this->givenASpin('Ten off', 'B4C5-D6F7', '0987654321');

        // The code finds its spin even though the phone does not match it.
        self::assertCount(1, $this->search(self::CODE)['spins']);

        // And the number finds the same spin from the other side.
        self::assertSame(
            self::CODE,
            $this->search('0912345678')['spins'][0]['code'],
        );
    }

    /** F16 R13 */
    public function testACodeNobodyWasGivenMatchesNothing(): void
    {
        $this->givenASpin('Free coffee', self::CODE);

        $found = $this->search('Z9Y8-X7W6');

        self::assertSame([], $found['spins']);
        self::assertSame(0, $found['total']);
    }

    /**
     * F16 R12: a character the alphabet excludes cannot be in any code, so
     * the code column is not asked — and the input is not a phone number
     * either, so nothing matches. The point is that it does not throw and
     * does not quietly match everything.
     */
    public function testAMisreadCharacterMatchesNothing(): void
    {
        $this->givenASpin('Free coffee', self::CODE);

        foreach (['A7K3-M9PO', 'A7K3-M9P0', 'A7K3-M9PI', 'A7K3-M9PL'] as $misread) {
            $found = $this->search($misread);

            self::assertSame([], $found['spins'], sprintf('"%s" matched something.', $misread));
        }
    }

    /**
     * F16 R15, the same shape of exclusion as F09 R18's: a filter that asks
     * about codes cannot show the rows that have none.
     */
    public function testFilteringByCodeLeavesOutTheLosingSpins(): void
    {
        $this->givenASpin('Free coffee', self::CODE);
        $this->givenALosingSpin();

        self::assertSame(2, $this->search('')['total'], 'Both spins are in the log.');

        $found = $this->search('A7K3');

        self::assertCount(1, $found['spins']);
        self::assertSame(self::CODE, $found['spins'][0]['code']);
    }

    /** F16 R14: found by its code, claimed from its row (F13 R22). */
    public function testASpinFoundByItsCodeIsClaimedFromItsRow(): void
    {
        $this->givenASpin('Free coffee', self::CODE);

        $this->signInAsAdmin();

        $row = $this->search(self::CODE)['spins'][0];

        self::assertTrue($row['claimable']);
        self::assertNull($row['claimedAt']);

        $this->put(self::SPINS_URI.'/'.$row['id'].'/claim', ['claimed' => true]);

        self::assertResponseIsSuccessful();
        self::assertNotNull($this->decodeResponse()['spin']['claimedAt']);
    }

    /** A filter of nothing is not a filter (F09 R19 still reads the same). */
    public function testWhitespaceIsNotAFilter(): void
    {
        $this->givenASpin('Free coffee', self::CODE);
        $this->givenALosingSpin();

        self::assertSame(2, $this->search('   ')['total']);
        self::assertCount(2, $this->search('   ')['spins']);
    }

    /** F16 R5: a free-product spin from before F16 still carries no code. */
    public function testASpinWithNoCodeIsStillListed(): void
    {
        $this->givenASpin('Free coffee', null);

        $found = $this->search('');

        self::assertCount(1, $found['spins']);
        self::assertNull($found['spins'][0]['code']);
    }

    // ---------------------------------------------------------------- helpers

    /**
     * @return array{spins: list<array<string, mixed>>, total: int}
     */
    private function search(string $filter): array
    {
        $this->signInAsAdmin();

        $this->client->request('GET', self::SPINS_URI.'?search='.urlencode($filter));

        self::assertResponseIsSuccessful();

        /** @var array{spins: list<array<string, mixed>>, total: int} $body */
        $body = $this->decodeResponse();

        return $body;
    }

    private function givenASpin(
        string $prizeName,
        ?string $code,
        string $phone = '0912345678',
        RewardType $type = RewardType::FreeProduct,
    ): Spin {
        /*
         * F26 R1: a spin's prize name is its reward's name, so the reward has
         * to *be* the prize this fixture was asked for rather than something
         * named after it. Reward names are unique (F13 R4), so two spins of
         * one prize find the same reward and share it — which is what a real
         * wheel does too.
         */
        $reward = $this->entityManager->getRepository(Reward::class)
            ->findOneBy(['name' => $prizeName]);

        if (!$reward instanceof Reward) {
            $reward = new Reward($prizeName, $type, $type->needsValue() ? 10 : null);
            $this->entityManager->persist($reward);
        }

        /*
         * F27 R6: one wheel per game, so every spin in this fixture hangs off
         * the same one rather than off a wheel of its own. The unique index
         * on game_id would refuse the second anyway.
         */
        $wheel = $this->entityManager->getRepository(Wheel::class)
            ->findOneBy(['game' => $this->game]);

        if (!$wheel instanceof Wheel) {
            $wheel = new Wheel();
            $wheel->setGame($this->game);
            $this->entityManager->persist($wheel);
        }

        $prize = new Prize(100, $wheel->getPrizes()->count(), $reward);
        $wheel->addPrize($prize);
        $this->entityManager->persist($prize);

        // Reused, because a number identifies a player (F08) and two spins
        // by the same person is one of the things being tested.
        $player = $this->entityManager->getRepository(Player::class)->findOneBy(['phone' => $phone]);

        if (!$player instanceof Player) {
            $player = new Player($phone, 'Anh', 'Le', new \DateTimeImmutable('1994-03-12'));
            $this->entityManager->persist($player);
        }

        $spin = Spin::forPrize($prize, $player);
        // F27 R9: a spin records the game it was played on.
        $spin->setGame($this->game);

        if (null !== $code) {
            $spin->setRewardCode($code);
        }

        $this->entityManager->persist($spin);
        $this->entityManager->flush();

        return $spin;
    }

    /** A spin that won nothing, which by R2 can carry no code. */
    private function givenALosingSpin(): Spin
    {
        return $this->givenASpin('Maybe next time', null, '0912345678', RewardType::Nothing);
    }
}
