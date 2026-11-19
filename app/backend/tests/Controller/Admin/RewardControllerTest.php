<?php

declare(strict_types=1);

namespace App\Tests\Controller\Admin;

use App\Entity\Reward;
use App\Reward\RewardType;
use App\Tests\Support\DatabaseWebTestCase;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpFoundation\Response;

/**
 * F13 R1–R6: the reward catalogue.
 */
final class RewardControllerTest extends DatabaseWebTestCase
{
    private const URI = '/api/admin/rewards';

    // --------------------------------------------------------------- the guard

    public function testTheCatalogueIsClosedToStrangers(): void
    {
        $this->client->request('GET', self::URI);

        self::assertResponseStatusCodeSame(Response::HTTP_UNAUTHORIZED);
    }

    public function testAddingIsClosedToStrangers(): void
    {
        $this->post(self::URI, ['name' => 'Sneaky', 'type' => 'free_product']);

        self::assertResponseStatusCodeSame(Response::HTTP_UNAUTHORIZED);
        self::assertSame(0, $this->countRows('reward'));
    }

    // ----------------------------------------------------------------- listing

    public function testItListsTheCatalogueWithTheTypesToChooseFrom(): void
    {
        $this->signInAsAdmin();
        $this->add('Free coffee', 'free_product');
        $this->add('Ten off', 'percent_off', 10);

        $this->client->request('GET', self::URI);

        self::assertResponseIsSuccessful();

        $body = $this->decodeResponse();

        self::assertCount(2, $body['rewards']);
        self::assertSame(
            ['id', 'name', 'type', 'value', 'createdAt', 'usedBy'],
            array_keys($body['rewards'][0]),
        );

        // The selector's options ride along, so the admin page can render a
        // form without a second request (F13 §9).
        self::assertSame(
            ['free_product', 'percent_off', 'amount_off', 'nothing'],
            array_column($body['types'], 'value'),
        );
    }

    /** Insertion order, so a rename does not move a row (RewardRepository). */
    public function testTheCatalogueKeepsTheOrderThingsWereAddedIn(): void
    {
        $this->signInAsAdmin();
        $this->add('First', 'free_product');
        $this->add('Second', 'free_product');
        $this->add('Third', 'free_product');

        $this->client->request('GET', self::URI);

        self::assertSame(
            ['First', 'Second', 'Third'],
            array_column($this->decodeResponse()['rewards'], 'name'),
        );
    }

    // ---------------------------------------------------------------- adding

    /** F13 R1 */
    public function testItAddsAReward(): void
    {
        $this->signInAsAdmin();

        $this->add('Twenty per cent', 'percent_off', 20);

        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);

        $reward = $this->decodeResponse()['reward'];

        self::assertSame('Twenty per cent', $reward['name']);
        self::assertSame('percent_off', $reward['type']);
        self::assertSame(20, $reward['value']);
        self::assertSame([], $reward['usedBy']);
        self::assertSame(1, $this->countRows('reward'));
    }

    public function testItTrimsTheName(): void
    {
        $this->signInAsAdmin();

        $this->add('   Free coffee  ', 'free_product');

        self::assertSame('Free coffee', $this->decodeResponse()['reward']['name']);
    }

    /** F13 R4 */
    public function testItRefusesADuplicateName(): void
    {
        $this->signInAsAdmin();
        $this->add('Free coffee', 'free_product');

        $this->add('Free coffee', 'percent_off', 5);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('name', $this->decodeResponse()['error']['violations'][0]['field']);
        self::assertSame(1, $this->countRows('reward'));
    }

    public function testItRefusesABlankName(): void
    {
        $this->signInAsAdmin();

        $this->add('   ', 'free_product');

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame(0, $this->countRows('reward'));
    }

    public function testItRefusesANameBeyondTheLimit(): void
    {
        $this->signInAsAdmin();

        $this->add(str_repeat('x', Reward::NAME_MAX_LENGTH + 1), 'free_product');

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
    }

    public function testItAcceptsAnAccentedNameUpToTheCharacterLimit(): void
    {
        $this->signInAsAdmin();

        $this->add(str_repeat('ễ', Reward::NAME_MAX_LENGTH), 'free_product');

        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);
    }

    public function testItRefusesATypeItDoesNotHave(): void
    {
        $this->signInAsAdmin();

        $this->add('Mystery', 'teleportation');

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('type', $this->decodeResponse()['error']['violations'][0]['field']);
    }

    // ----------------------------------------------------------------- values

    /** F13 R3 */
    #[DataProvider('badValues')]
    public function testItRefusesAValueThatIsNotOne(string $type, mixed $value): void
    {
        $this->signInAsAdmin();

        $this->post(self::URI, ['name' => 'Bad', 'type' => $type, 'value' => $value]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('value', $this->decodeResponse()['error']['violations'][0]['field']);
        self::assertSame(0, $this->countRows('reward'));
    }

    /**
     * @return iterable<string, array{string, mixed}>
     */
    public static function badValues(): iterable
    {
        yield 'no percentage' => ['percent_off', null];
        yield 'zero per cent' => ['percent_off', 0];
        yield 'a hundred and one per cent' => ['percent_off', 101];
        yield 'a fractional percentage' => ['percent_off', 7.5];
        yield 'a percentage as a string' => ['percent_off', '10'];
        yield 'no amount' => ['amount_off', null];
        yield 'a zero amount' => ['amount_off', 0];
        yield 'a negative amount' => ['amount_off', -5];
        // F21 R3. Above the cap is a message, never a truncation and never
        // a 500 — which is what it was, depending on the database.
        yield 'an amount past the cap' => ['amount_off', RewardType::MAX_AMOUNT + 1];
        yield 'an amount of fifteen digits' => ['amount_off', 999_999_999_999_999];
    }

    /**
     * F21 R1, R2, and the bug it closes. 50,000 is an ordinary Vietnamese
     * promotion, about EUR 1.80. It used to be stored as 32,767 on a
     * database without strict mode, and to be a 500 on one with it.
     */
    #[DataProvider('realisticAmounts')]
    public function testItStoresAnAmountTooBigForTheOldColumn(int $amount): void
    {
        $this->signInAsAdmin();

        $id = $this->addAndGetId('Big discount', 'amount_off', $amount);

        $this->client->request('GET', self::URI);

        $stored = array_values(array_filter(
            $this->decodeResponse()['rewards'],
            static fn (array $reward): bool => $reward['id'] === $id,
        ));

        self::assertCount(1, $stored);
        self::assertSame($amount, $stored[0]['value'], 'The amount was not stored as entered.');
    }

    /**
     * @return iterable<string, array{int}>
     */
    public static function realisticAmounts(): iterable
    {
        yield 'fifty thousand dong' => [50_000];
        yield 'two hundred thousand dong' => [200_000];
        yield 'one past the old smallint ceiling' => [32_768];
        yield 'the cap itself' => [RewardType::MAX_AMOUNT];
    }

    /** F21 R3: and the message says what the limit is. */
    public function testItSaysWhatTheAmountLimitIs(): void
    {
        $this->signInAsAdmin();

        $this->add('Too big', 'amount_off', RewardType::MAX_AMOUNT + 1);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);

        $violation = $this->decodeResponse()['error']['violations'][0];

        self::assertSame('value', $violation['field']);
        self::assertStringContainsString(
            (string) RewardType::MAX_AMOUNT,
            $violation['message'],
            'The admin is not told what the limit is.',
        );
        self::assertSame(0, $this->countRows('reward'));
    }

    /** F21 R5: percentages were already right and are untouched. */
    public function testThePercentageLimitsAreUnchanged(): void
    {
        $this->signInAsAdmin();

        $this->addAndGetId('All of it', 'percent_off', 100);

        $this->add('More than all of it', 'percent_off', 101);
        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);

        self::assertSame(1, $this->countRows('reward'));
    }

    /**
     * F13 R3. Rejected, not dropped: an admin who typed 10 against a free
     * product and watched it vanish assumes the page is broken.
     */
    #[DataProvider('typesWithoutValues')]
    public function testItRefusesAValueOnATypeThatTakesNone(string $type): void
    {
        $this->signInAsAdmin();

        $this->post(self::URI, ['name' => 'Odd', 'type' => $type, 'value' => 10]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('value', $this->decodeResponse()['error']['violations'][0]['field']);
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function typesWithoutValues(): iterable
    {
        yield 'free product' => ['free_product'];
        yield 'nothing' => ['nothing'];
    }

    /** F13 R3 — the boundaries themselves */
    public function testItAcceptsThePercentageBoundaries(): void
    {
        $this->signInAsAdmin();

        $this->add('One per cent', 'percent_off', RewardType::MIN_PERCENT);
        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);

        $this->add('Everything', 'percent_off', RewardType::MAX_PERCENT);
        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);
    }

    public function testAFreeProductIsStoredWithNoValue(): void
    {
        $this->signInAsAdmin();

        $this->add('Free coffee', 'free_product');

        self::assertNull($this->decodeResponse()['reward']['value']);
    }

    // ---------------------------------------------------------------- editing

    public function testItChangesAReward(): void
    {
        $this->signInAsAdmin();
        $id = $this->addAndGetId('Ten off', 'percent_off', 10);

        $this->put(self::URI.'/'.$id, ['name' => 'Fifteen off', 'type' => 'percent_off', 'value' => 15]);

        self::assertResponseIsSuccessful();
        self::assertSame('Fifteen off', $this->decodeResponse()['reward']['name']);
        self::assertSame(15, $this->decodeResponse()['reward']['value']);
        self::assertSame(1, $this->countRows('reward'), 'Editing must not add a row.');
    }

    /**
     * The value is cleared when the type can no longer carry one, so a
     * reward changed from 10% off to a free product cannot keep a stray 10
     * that nothing displays and something later reads.
     */
    public function testChangingTheTypeDropsAValueItCannotCarry(): void
    {
        $this->signInAsAdmin();
        $id = $this->addAndGetId('Ten off', 'percent_off', 10);

        $this->put(self::URI.'/'.$id, ['name' => 'Free coffee', 'type' => 'free_product']);

        self::assertResponseIsSuccessful();
        self::assertNull($this->decodeResponse()['reward']['value']);
    }

    public function testItRefusesRenamingOntoAnotherReward(): void
    {
        $this->signInAsAdmin();
        $this->add('Free coffee', 'free_product');
        $id = $this->addAndGetId('Ten off', 'percent_off', 10);

        $this->put(self::URI.'/'.$id, ['name' => 'Free coffee', 'type' => 'percent_off', 'value' => 10]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
    }

    public function testEditingSomethingThatDoesNotExistIsANotFound(): void
    {
        $this->signInAsAdmin();

        $this->put(self::URI.'/4242', ['name' => 'Ghost', 'type' => 'free_product']);

        self::assertResponseStatusCodeSame(Response::HTTP_NOT_FOUND);
    }

    // --------------------------------------------------------------- deleting

    public function testItDeletesAnUnusedReward(): void
    {
        $this->signInAsAdmin();
        $id = $this->addAndGetId('Free coffee', 'free_product');

        $this->client->request('DELETE', self::URI.'/'.$id);

        self::assertResponseStatusCodeSame(Response::HTTP_NO_CONTENT);
        self::assertSame(0, $this->countRows('reward'));
    }

    /**
     * F13 R6. Named, not counted: "it is on the wheel" leaves the admin
     * hunting for which slice.
     */
    public function testItRefusesToDeleteARewardASliceUsesAndNamesTheSlice(): void
    {
        $this->signInAsAdmin();
        $id = $this->addAndGetId('Free coffee', 'free_product');

        $this->put($this->wheelUri(), [
            'prizes' => [
                ['name' => 'Lucky you!', 'probability' => 50, 'rewardId' => $id],
                ['name' => 'Other', 'probability' => 50, 'rewardId' => $this->aRewardId()],
            ],
        ]);
        self::assertResponseIsSuccessful();

        $this->client->request('DELETE', self::URI.'/'.$id);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);

        // F26 R1 left the refusal nothing to name but the place on the wheel:
        // a label would be this reward's own name, so "Free coffee is used by
        // Free coffee" is the best it could have said.
        self::assertStringContainsString('#1', $this->decodeResponse()['error']['violations'][0]['message']);

        // Checked by name rather than by counting rows: saving a wheel runs
        // WheelProvider, which seeds the six default rewards (F01 R2), so
        // the total here is not a number this test should care about.
        $this->entityManager->clear();
        self::assertNotNull(
            $this->entityManager->getRepository(Reward::class)->findOneBy(['name' => 'Free coffee']),
            'The refused delete must have left the reward alone.',
        );
    }

    /** The list says what is in use, so the page can grey out its delete. */
    public function testTheListReportsWhichSlicesUseEachReward(): void
    {
        $this->signInAsAdmin();
        $id = $this->addAndGetId('Free coffee', 'free_product');

        $this->put($this->wheelUri(), [
            'prizes' => [
                ['name' => 'Lucky you!', 'probability' => 50, 'rewardId' => $id],
                ['name' => 'Other', 'probability' => 50, 'rewardId' => $this->aRewardId()],
            ],
        ]);

        $this->client->request('GET', self::URI);

        $byName = array_column($this->decodeResponse()['rewards'], 'usedBy', 'name');

        // Positions counted from 1, as an admin counts the rows (F26 R24).
        self::assertSame([1], $byName['Free coffee']);
    }

    // ------------------------------------------------- F15: the currency

    /** F15 R9: the campaign's currency is settled by the save that needs it. */
    public function testAddingAnAmountOffSetsTheCampaignCurrency(): void
    {
        $this->signInAsAdmin();

        $this->post(self::URI, [
            'name' => 'Five euros off',
            'type' => 'amount_off',
            'value' => 5,
            'currency' => 'EUR',
        ]);

        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);
        self::assertSame('EUR', $this->storedCurrency());
    }

    /** F15 R9, on an edit as much as on a create. */
    public function testChangingAnAmountOffSetsTheCampaignCurrency(): void
    {
        $this->signInAsAdmin();
        $id = $this->addAndGetId('Five off', 'amount_off', 5);

        $this->put(self::URI.'/'.$id, [
            'name' => 'Five off',
            'type' => 'amount_off',
            'value' => 5,
            'currency' => 'GBP',
        ]);

        self::assertResponseIsSuccessful();
        self::assertSame('GBP', $this->storedCurrency());
    }

    /**
     * F15 R7. A currency arriving with a type that has no amount is a
     * field the admin could not see, so it is ignored rather than refused
     * — the same way a value for such a type is (F13 R3).
     */
    public function testACurrencyIsIgnoredOnATypeWithNoAmount(): void
    {
        $this->signInAsAdmin();

        $this->post(self::URI, [
            'name' => 'Free coffee',
            'type' => 'free_product',
            'currency' => 'EUR',
        ]);

        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);
        self::assertNull($this->storedCurrency(), 'nothing was chosen');
    }

    /** F15 R4: absent leaves the campaign unchosen. */
    public function testAnAmountOffWithNoCurrencyChoosesNothing(): void
    {
        $this->signInAsAdmin();

        $this->add('Five off', 'amount_off', 5);

        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);
        self::assertNull($this->storedCurrency());
    }

    public function testItRefusesACurrencyItDoesNotHave(): void
    {
        $this->signInAsAdmin();

        $this->post(self::URI, [
            'name' => 'Five off',
            'type' => 'amount_off',
            'value' => 5,
            'currency' => 'XAU',
        ]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame(
            'currency',
            $this->decodeResponse()['error']['violations'][0]['field'],
        );
        self::assertSame(0, $this->countRows('reward'), 'and the reward was not created');
    }

    // ---------------------------------------------------------------- helpers

    /** Null until somebody chooses (F15 R4). */
    private function storedCurrency(): ?string
    {
        /** @var string|false|null $value */
        $value = $this->entityManager
            ->getConnection()
            ->fetchOne('SELECT currency FROM store');

        return \is_string($value) ? $value : null;
    }

    private function add(string $name, string $type, ?int $value = null): void
    {
        $payload = ['name' => $name, 'type' => $type];

        if (null !== $value) {
            $payload['value'] = $value;
        }

        $this->post(self::URI, $payload);
    }

    private function addAndGetId(string $name, string $type, ?int $value = null): int
    {
        $this->add($name, $type, $value);
        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);

        $id = $this->decodeResponse()['reward']['id'];
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
