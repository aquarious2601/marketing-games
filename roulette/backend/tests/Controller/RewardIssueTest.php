<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Entity\Spin;
use App\Reward\CodeGenerator;
use App\Tests\Support\DatabaseWebTestCase;
use Symfony\Component\HttpFoundation\Response;

/**
 * F13 R16–R26: what happens when a reward is actually won.
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

    /** F13 R19 */
    public function testAFreeProductIsIssuedNoCode(): void
    {
        $this->givenAWheelOfOne($this->aRewardId('Free coffee'));
        $this->identifyAsPlayer();

        $this->client->request('POST', self::SPIN_URI);

        self::assertResponseIsSuccessful();
        self::assertSame('free_product', $this->decodeResponse()['reward']['type']);
        self::assertNull($this->decodeResponse()['reward']['code']);
    }

    /** F13 R15, R19 — a losing item is recorded, and carries nothing */
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
     * F13 R17 through the real unique index, which is the only thing that
     * actually guarantees it.
     */
    public function testEveryIssuedCodeIsDifferent(): void
    {
        $this->givenAWheelOfOne($this->aDiscountRewardId('Ten off', 10));
        $this->identifyAsPlayer();

        $codes = [];

        for ($i = 0; $i < 25; ++$i) {
            $this->client->request('POST', self::SPIN_URI);
            self::assertResponseIsSuccessful();

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

    /** F13 R19, R21 — a free product has no code but is still claimable */
    public function testAFreeProductIsClaimableWithoutACode(): void
    {
        $id = $this->givenASpin($this->aRewardId('Free coffee'));

        $this->signInAsAdmin();
        $this->put('/api/admin/spins/'.$id.'/claim', ['claimed' => true]);

        self::assertResponseIsSuccessful();
        self::assertNull($this->decodeResponse()['spin']['code']);
        self::assertNotNull($this->decodeResponse()['spin']['claimedAt']);
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

        $this->put('/api/admin/wheel', [
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
     * @return array{type: string, value: int|null, code: string|null}
     */
    private function givenAMostlyLosingWheel(): array
    {
        $this->signInAsAdmin();

        $this->put('/api/admin/wheel', [
            'prizes' => [
                ['name' => 'Maybe next time', 'probability' => 99, 'rewardId' => $this->aLosingRewardId()],
                ['name' => 'Something', 'probability' => 1, 'rewardId' => $this->aRewardId()],
            ],
        ]);
        self::assertResponseIsSuccessful();

        $this->client->request('POST', '/api/logout');
        $this->identifyAsPlayer();

        for ($attempt = 0; $attempt < 40; ++$attempt) {
            $this->client->request('POST', self::SPIN_URI);
            self::assertResponseIsSuccessful();

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
