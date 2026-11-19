<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Entity\Reward;
use App\Entity\Spin;
use App\Reward\CodeGenerator;
use App\Tests\Support\DatabaseWebTestCase;
use Symfony\Component\HttpFoundation\Response;

/**
 * F13 R16–R26 with F16 R1–R6: what happens when a reward is actually won.
 *
 * Driven through real spins rather than by constructing entities, because
 * the thing under test is that the code is issued *inside* the transaction
 * that records the spin — which only a real request exercises.
 */
final class RewardIssueTest extends DatabaseWebTestCase
{
    private const SPIN_URI = '/api/spin';

    /** F13 R16, R20 — a discount is issued a code and the player is told it */
    public function testADiscountIsIssuedACodeAndThePlayerIsShownIt(): void
    {
        $this->givenAWheelOfOne($this->aDiscountRewardId('Ten off', 10));
        $this->identifyAsPlayer();

        $this->client->request('POST', self::SPIN_URI);

        self::assertResponseIsSuccessful();

        $reward = $this->decodeResponse()['reward'];

        self::assertSame('percent_off', $reward['type']);
        self::assertSame(10, $reward['value']);
        self::assertMatchesRegularExpression(CodeGenerator::pattern(), (string) $reward['code']);
    }

    /**
     * F16 R1, replacing F13 R19.
     *
     * The free product is the case that changed: it used to be claimed by
     * showing the screen, and F10 made the screen clear itself.
     */
    public function testAFreeProductIsIssuedACode(): void
    {
        $this->givenAWheelOfOne($this->aRewardId('Free coffee'));
        $this->identifyAsPlayer();

        $this->client->request('POST', self::SPIN_URI);

        self::assertResponseIsSuccessful();

        $reward = $this->decodeResponse()['reward'];

        self::assertSame('free_product', $reward['type']);
        self::assertMatchesRegularExpression(CodeGenerator::pattern(), (string) $reward['code']);
    }

    /** F13 R15 with F16 R2 — a losing item is recorded, and carries nothing */
    public function testALosingItemIsRecordedWithNoCode(): void
    {
        $reward = $this->givenAMostlyLosingWheel();

        self::assertSame('nothing', $reward['type']);
        self::assertNull($reward['code']);

        // Drawn and recorded exactly like any other slice.
        self::assertGreaterThanOrEqual(1, $this->countRows('spin'));
    }

    /** F02 R2 still holds: no odds anywhere in the new block. */
    public function testTheRewardBlockCarriesNoProbability(): void
    {
        $this->givenAWheelOfOne($this->aDiscountRewardId('Ten off', 10));
        $this->identifyAsPlayer();

        $this->client->request('POST', self::SPIN_URI);

        $body = (string) $this->client->getResponse()->getContent();

        self::assertStringNotContainsString('probability', $body);
        self::assertSame(['type', 'value', 'code'], array_keys($this->decodeResponse()['reward']));
    }

    /**
     * F13 R17 and F16 R3 through the real unique index, which is the only
     * thing that actually guarantees it.
     *
     * Spun on a free product rather than a discount, because that is the
     * path F16 added and the index it has to share is the same one.
     */
    public function testEveryIssuedCodeIsDifferent(): void
    {
        $this->givenAWheelOfOne($this->aRewardId('Free coffee'));
        $this->identifyAsPlayer();

        $codes = [];

        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();
        $codes[] = $this->decodeResponse()['reward']['code'];

        // One identification per spin from here (F20 R1). The index this
        // test is really about does not care how many sessions the spins
        // came from.
        for ($i = 0; $i < 24; ++$i) {
            $this->spinOnceMore();

            $codes[] = $this->decodeResponse()['reward']['code'];
        }

        self::assertCount(25, array_unique($codes));
    }

    /** F13 R25 — the snapshot survives the catalogue changing underneath */
    public function testTheSpinRemembersWhatItWasWonAt(): void
    {
        $rewardId = $this->aDiscountRewardId('Ten off', 10);
        $this->givenAWheelOfOne($rewardId);
        $this->identifyAsPlayer();

        $this->client->request('POST', self::SPIN_URI);
        $code = $this->decodeResponse()['reward']['code'];

        // The shop changes its mind about the discount.
        $this->signInAsAdmin();
        $this->put('/api/admin/rewards/'.$rewardId, [
            'name' => 'Ten off',
            'type' => 'percent_off',
            'value' => 50,
        ]);
        self::assertResponseIsSuccessful();

        $this->client->request('GET', '/api/admin/spins');

        $logged = $this->decodeResponse()['spins'][0];

        self::assertSame(10, $logged['rewardValue'], 'The log must say what was won, not what is current.');
        self::assertSame($code, $logged['code']);
    }

    /**
     * F26 R25. The snapshot column was 40 characters, sized to the slice
     * label it used to copy. A reward name may be 256, and a spin has to
     * record the whole of it — on CI's strict MariaDB a narrow column fails
     * the insert at the moment somebody presses the button, and on a lenient
     * one it truncates the record of what they won.
     */
    public function testASpinRecordsAFullLengthPrizeNameWhole(): void
    {
        $name = str_repeat('é', Reward::NAME_MAX_LENGTH);
        $this->givenAWheelOfOne($this->aDiscountRewardId($name, 10));
        $this->identifyAsPlayer();

        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();

        self::assertSame($name, $this->decodeResponse()['prize']['name']);

        $this->signInAsAdmin();
        $this->client->request('GET', '/api/admin/spins');

        self::assertSame($name, $this->decodeResponse()['spins'][0]['prizeName']);
    }

    // --------------------------------------------------------------- claiming

    /** F13 R21, R22 */
    public function testStaffCanClaimAReward(): void
    {
        $id = $this->givenASpin($this->aDiscountRewardId('Ten off', 10));

        $this->signInAsAdmin();
        $this->put('/api/admin/spins/'.$id.'/claim', ['claimed' => true]);

        self::assertResponseIsSuccessful();

        $spin = $this->decodeResponse()['spin'];

        self::assertNotNull($spin['claimedAt']);
        self::assertTrue($spin['claimable']);
    }

    /** F13 R23: a mis-tap at a counter must not be permanent. */
    public function testClaimingIsReversible(): void
    {
        $id = $this->givenASpin($this->aDiscountRewardId('Ten off', 10));

        $this->signInAsAdmin();

        $this->put('/api/admin/spins/'.$id.'/claim', ['claimed' => true]);
        self::assertNotNull($this->decodeResponse()['spin']['claimedAt']);

        $this->put('/api/admin/spins/'.$id.'/claim', ['claimed' => false]);
        self::assertNull($this->decodeResponse()['spin']['claimedAt']);
    }

    /**
     * Idempotent: a second tap keeps the original moment rather than quietly
     * moving it, so the record of when it happened stays true.
     */
    public function testClaimingTwiceKeepsTheFirstMoment(): void
    {
        $id = $this->givenASpin($this->aDiscountRewardId('Ten off', 10));

        $this->signInAsAdmin();

        $this->put('/api/admin/spins/'.$id.'/claim', ['claimed' => true]);
        $first = $this->decodeResponse()['spin']['claimedAt'];

        $this->put('/api/admin/spins/'.$id.'/claim', ['claimed' => true]);

        self::assertSame($first, $this->decodeResponse()['spin']['claimedAt']);
    }

    // ------------------------------------------ F32 R8-R10: the cost snapshot

    /** F32 R8. The cost is written onto the spin as it is won. */
    public function testASpinRemembersWhatItCost(): void
    {
        $reward = $this->givenAPricedFreeProduct('Free coffee', 25_000);

        $id = $this->givenASpin($reward);

        self::assertSame(25_000, $this->costOf($id));
    }

    /**
     * F32 R9. The whole reason it is a snapshot: a price corrected next
     * month must not restate last month's figures. A number an owner read on
     * Monday has to still be that number on Friday.
     */
    public function testCorrectingAPriceLeavesTheSpinsAlreadyRecorded(): void
    {
        $reward = $this->givenAPricedFreeProduct('Free coffee', 25_000);
        $id = $this->givenASpin($reward);

        $this->signInAsAdmin();
        $this->put('/api/admin/rewards/'.$reward, [
            'name' => 'Free coffee',
            'type' => 'free_product',
            'cost' => 30_000,
        ]);
        self::assertResponseIsSuccessful();

        self::assertSame(25_000, $this->costOf($id), 'The recorded spin moved.');

        // And the next win of it carries the new figure, which is the other
        // half of R9: the correction applies from now on.
        $this->client->request('POST', '/api/logout');
        $this->identifyAsPlayer();
        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();

        $next = $this->entityManager->getRepository(Spin::class)->findOneBy([], ['id' => 'DESC']);
        self::assertInstanceOf(Spin::class, $next);
        self::assertSame(30_000, $next->getRewardCost());
    }

    /**
     * F32 R10. A reward nobody had priced leaves an unpriced win, and
     * pricing it afterwards does not reach back: a cost appearing
     * retrospectively on a prize already handed over is exactly what the
     * snapshot is for.
     */
    public function testAnUnpricedWinStaysUnpriced(): void
    {
        $reward = $this->aRewardId('Mystery gift');
        $id = $this->givenASpin($reward);

        self::assertNull($this->costOf($id));

        $this->signInAsAdmin();
        $this->put('/api/admin/rewards/'.$reward, [
            'name' => 'Mystery gift',
            'type' => 'free_product',
            'cost' => 25_000,
        ]);
        self::assertResponseIsSuccessful();

        self::assertNull($this->costOf($id), 'A cost appeared on a spin from before it.');
    }

    /**
     * F32 R4. A losing spin carries no cost at all.
     *
     * Through the mostly-losing wheel rather than a wheel of one, because
     * F14 R5 allows only one losing slice — the same reason
     * `givenAMostlyLosingWheel` exists at all.
     */
    public function testALosingSpinCostsNothingToRecord(): void
    {
        $this->givenAMostlyLosingWheel();

        $spin = $this->entityManager->getRepository(Spin::class)->findOneBy([], ['id' => 'DESC']);
        self::assertInstanceOf(Spin::class, $spin);

        $id = $spin->getId();
        self::assertIsInt($id);

        self::assertNull($this->costOf($id));
    }

    private function givenAPricedFreeProduct(string $name, int $cost): int
    {
        $id = $this->aRewardId($name);

        $this->signInAsAdmin();
        $this->put('/api/admin/rewards/'.$id, [
            'name' => $name,
            'type' => 'free_product',
            'cost' => $cost,
        ]);
        self::assertResponseIsSuccessful('The test could not price a reward.');

        return $id;
    }

    private function costOf(int $spin): ?int
    {
        $cost = $this->entityManager->getConnection()->fetchOne(
            'SELECT reward_cost FROM spin WHERE id = :id',
            ['id' => $spin],
        );

        return null === $cost || false === $cost ? null : (int) $cost;
    }

    // ------------------------------------------- F31 R19-R22: who claimed

    /** F31 R19. A hand-over has an author, and it is whoever is signed in. */
    public function testAClaimRecordsTheAccountThatMadeIt(): void
    {
        $id = $this->givenASpin($this->aDiscountRewardId('Ten off', 10));

        $this->signInAsAdmin('rosa');
        $this->put('/api/admin/spins/'.$id.'/claim', ['claimed' => true]);

        self::assertResponseIsSuccessful();
        self::assertSame('rosa', $this->decodeResponse()['spin']['claimedBy']);
    }

    /**
     * F31 R19. A second press keeps the first author, as it keeps the
     * first moment: the record is of the hand-over, not of the last tap.
     */
    public function testASecondPressKeepsTheFirstAuthor(): void
    {
        $id = $this->givenASpin($this->aDiscountRewardId('Ten off', 10));

        $this->signInAsAdmin('rosa');
        $this->put('/api/admin/spins/'.$id.'/claim', ['claimed' => true]);

        $this->signInAsAdmin('minh');
        $this->put('/api/admin/spins/'.$id.'/claim', ['claimed' => true]);

        self::assertSame('rosa', $this->decodeResponse()['spin']['claimedBy']);
    }

    /** F31 R20. An un-done claim did not happen, author and all. */
    public function testTakingAClaimBackClearsTheAuthorToo(): void
    {
        $id = $this->givenASpin($this->aDiscountRewardId('Ten off', 10));

        $this->signInAsAdmin('rosa');
        $this->put('/api/admin/spins/'.$id.'/claim', ['claimed' => true]);
        self::assertSame('rosa', $this->decodeResponse()['spin']['claimedBy']);

        $this->put('/api/admin/spins/'.$id.'/claim', ['claimed' => false]);

        $spin = $this->decodeResponse()['spin'];

        self::assertNull($spin['claimedAt']);
        self::assertNull($spin['claimedBy']);
    }

    /**
     * F31 R20, R22. And the next hand-over has its own author, so taking
     * a claim back does not leave the row bound to whoever pressed it
     * first.
     */
    public function testTheNextClaimHasItsOwnAuthor(): void
    {
        $id = $this->givenASpin($this->aDiscountRewardId('Ten off', 10));

        $this->signInAsAdmin('rosa');
        $this->put('/api/admin/spins/'.$id.'/claim', ['claimed' => true]);
        $this->put('/api/admin/spins/'.$id.'/claim', ['claimed' => false]);

        $this->signInAsAdmin('minh');
        $this->put('/api/admin/spins/'.$id.'/claim', ['claimed' => true]);

        self::assertSame('minh', $this->decodeResponse()['spin']['claimedBy']);
    }

    /**
     * F31 R22. A claim recorded before F31 has a moment and no author,
     * and is shown with a dash rather than with a guess.
     */
    public function testAClaimFromBeforeThisFeatureHasNoAuthor(): void
    {
        $id = $this->givenASpin($this->aDiscountRewardId('Ten off', 10));

        // Exactly what the upgrade leaves behind: a claim with a time and
        // a null author (the upgrade deliberately backfills nobody).
        $this->entityManager->getConnection()->executeStatement(
            'UPDATE spin SET claimed_at = UTC_TIMESTAMP(), claimed_by_id = NULL WHERE id = :id',
            ['id' => $id],
        );

        $this->signInAsAdmin();
        $this->client->request('GET', '/api/admin/spins');

        $spin = $this->decodeResponse()['spins'][0];

        self::assertNotNull($spin['claimedAt']);
        self::assertNull($spin['claimedBy']);
    }

    /** F13 R24 */
    public function testALosingSpinCannotBeClaimed(): void
    {
        $this->givenAMostlyLosingWheel();

        $spin = $this->entityManager->getRepository(Spin::class)->findOneBy([], ['id' => 'DESC']);
        self::assertInstanceOf(Spin::class, $spin);
        $id = $spin->getId();

        $this->signInAsAdmin();
        $this->put('/api/admin/spins/'.$id.'/claim', ['claimed' => true]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);

        $this->entityManager->clear();
        $spin = $this->entityManager->getRepository(Spin::class)->find($id);
        self::assertInstanceOf(Spin::class, $spin);
        self::assertFalse($spin->isClaimed());
    }

    /** F13 R21 with F16 R1 — a free product is claimed, and by a code now */
    public function testAFreeProductIsClaimedByItsCode(): void
    {
        $id = $this->givenASpin($this->aRewardId('Free coffee'));

        $this->signInAsAdmin();
        $this->put('/api/admin/spins/'.$id.'/claim', ['claimed' => true]);

        self::assertResponseIsSuccessful();

        $spin = $this->decodeResponse()['spin'];

        self::assertMatchesRegularExpression(CodeGenerator::pattern(), (string) $spin['code']);
        self::assertNotNull($spin['claimedAt']);
    }

    /** F13 R26 */
    public function testClaimingIsClosedToStrangers(): void
    {
        $id = $this->givenASpin($this->aDiscountRewardId('Ten off', 10));

        $this->put('/api/admin/spins/'.$id.'/claim', ['claimed' => true]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNAUTHORIZED);
    }

    /** A bare tap, with no body, means claim. */
    public function testAnEmptyBodyMeansClaim(): void
    {
        $id = $this->givenASpin($this->aDiscountRewardId('Ten off', 10));

        $this->signInAsAdmin();
        $this->client->request('PUT', '/api/admin/spins/'.$id.'/claim');

        self::assertResponseIsSuccessful();
        self::assertNotNull($this->decodeResponse()['spin']['claimedAt']);
    }

    // ---------------------------------------------------------------- helpers

    /**
     * A wheel whose every slice is the same reward, so the draw is certain
     * and the test is about the reward rather than about luck.
     */
    private function givenAWheelOfOne(int $rewardId): void
    {
        $this->signInAsAdmin();

        $this->put($this->wheelUri(), [
            'prizes' => [
                ['name' => 'This one', 'probability' => 50, 'rewardId' => $rewardId],
                ['name' => 'Also this one', 'probability' => 50, 'rewardId' => $rewardId],
            ],
        ]);
        self::assertResponseIsSuccessful();

        // Signed out again, so the spin that follows is a player's.
        $this->client->request('POST', '/api/logout');
    }

    /**
     * A wheel that nearly always loses, spun until it does (F13 R14, R15).
     *
     * R14 forbids two losing slices, so `givenAWheelOfOne` cannot be used
     * here — the wheel needs a second, claimable slice. Giving that slice
     * the minimum 1% and looping makes the losing draw certain in practice
     * without pretending the draw is deterministic: at 99% a run of 40
     * failures is about 1 in 10^80.
     *
     * Each retry identifies again (F20 R1). Without that, the second spin of
     * the loop is refused rather than drawn, so the one run in a hundred
     * where the first spin wins failed on a 409 instead of spinning on.
     *
     * @return array{type: string, value: int|null, code: string|null}
     */
    private function givenAMostlyLosingWheel(): array
    {
        $this->signInAsAdmin();

        $this->put($this->wheelUri(), [
            'prizes' => [
                ['name' => 'Maybe next time', 'probability' => 99, 'rewardId' => $this->aLosingRewardId()],
                ['name' => 'Something', 'probability' => 1, 'rewardId' => $this->aRewardId()],
            ],
        ]);
        self::assertResponseIsSuccessful();

        $this->client->request('POST', '/api/logout');
        $this->identifyAsPlayer();

        for ($attempt = 0; $attempt < 40; ++$attempt) {
            if (0 === $attempt) {
                $this->client->request('POST', self::SPIN_URI);
                self::assertResponseIsSuccessful();
            } else {
                $this->spinOnceMore();
            }

            /** @var array{type: string, value: int|null, code: string|null} $reward */
            $reward = $this->decodeResponse()['reward'];

            if ('nothing' === $reward['type']) {
                return $reward;
            }
        }

        self::fail('A 99% losing wheel never lost in forty spins.');
    }

    private function givenASpin(int $rewardId): int
    {
        $this->givenAWheelOfOne($rewardId);
        $this->identifyAsPlayer();

        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();

        $spin = $this->entityManager->getRepository(Spin::class)->findOneBy([]);
        self::assertInstanceOf(Spin::class, $spin);

        $id = $spin->getId();
        self::assertIsInt($id);

        return $id;
    }

    private function countRows(string $table): int
    {
        return (int) $this->entityManager
            ->getConnection()
            ->fetchOne(sprintf('SELECT COUNT(*) FROM %s', $table));
    }
}
