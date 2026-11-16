<?php

declare(strict_types=1);

namespace App\Tests\Schema;

use App\Reward\RewardType;
use App\Schema\DatabaseUpgrade;
use App\Schema\UpgradeStep;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\DriverManager;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * P02 R1–R20.
 *
 * Runs against a database of its own rather than the suite's, built from
 * the `CREATE TABLE` statements below. Those are the pre-F13 shape, copied
 * from a database that had it, and they are deliberately hand-written: a
 * fixture generated from today's entity mapping would be the shape the
 * upgrade produces, so the test would start from the finish line.
 *
 * The suite's own database cannot be used because this test has to dismantle
 * the schema to have anything to upgrade, and a failure half way would take
 * every test after it down with it (P02 section 12).
 */
final class DatabaseUpgradeTest extends KernelTestCase
{
    private const SCRATCH_DATABASE = 'roulette_upgrade_test';

    private Connection $connection;

    protected function setUp(): void
    {
        self::bootKernel();

        $this->connection = $this->freshScratchDatabase();
        $this->createPreF13Schema();
    }

    protected function tearDown(): void
    {
        $this->connection->close();

        $this->withoutScratchDatabase(
            static fn (Connection $admin) => $admin->executeStatement(
                'DROP DATABASE IF EXISTS `'.self::SCRATCH_DATABASE.'`',
            ),
        );

        parent::tearDown();
    }

    /** P02 R20 */
    public function testItRefusesADatabaseWithNoTables(): void
    {
        $this->connection->executeStatement('SET FOREIGN_KEY_CHECKS = 0');

        foreach (['spin', 'prize', 'wheel', 'player', 'branding'] as $table) {
            $this->connection->executeStatement('DROP TABLE `'.$table.'`');
        }

        $this->connection->executeStatement('SET FOREIGN_KEY_CHECKS = 1');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessageMatches('/schema:update/');

        $this->upgrade()->run();
    }

    /** P02 R6, R7 */
    public function testItCreatesTheCatalogueWithTheSixDefaults(): void
    {
        $this->givenTheDefaultWheel();

        $this->upgrade()->run();

        self::assertSame(6, $this->countRows('reward'));
        self::assertSame(
            1,
            $this->countWhere('reward', "type = '".RewardType::Nothing->value."'"),
            'exactly one of the defaults is the losing one',
        );
    }

    /**
     * P02 R9, R10. The default wheel is the case that has to be right: every
     * database that exists today holds one, and the one slice whose label
     * differs from its reward's name is the losing slice.
     */
    public function testItPointsAnUntouchedWheelAtTheMatchingDefaults(): void
    {
        $this->givenTheDefaultWheel();

        $this->upgrade()->run();

        $slices = $this->connection->fetchAllAssociative(
            'SELECT p.name, p.position, r.name AS reward, r.type FROM prize p '
            .'INNER JOIN reward r ON r.id = p.reward_id ORDER BY p.position',
        );

        self::assertCount(6, $slices);

        // R10: "Try again" is the slice's label and "Maybe next time" is the
        // reward's name. Matching on the label alone would have invented a
        // claimable free product for the one slice that must never be claimed.
        self::assertSame('Try again', $slices[0]['name']);
        self::assertSame(RewardType::Nothing->value, $slices[0]['type']);

        self::assertSame(RewardType::PercentOff->value, $slices[1]['type']);
        self::assertSame(RewardType::PercentOff->value, $slices[2]['type']);
        self::assertSame(RewardType::FreeProduct->value, $slices[5]['type']);

        // Nothing beyond the six defaults was invented.
        self::assertSame(6, $this->countRows('reward'));
    }

    /**
     * P02 R10: the same wheel, configured in Chinese, upgrades the same way.
     *
     * Chinese rather than French because its losing *label* (再试一次) and its
     * losing *reward* (下次再来) are different words, as in English — French
     * happens to use the same string for both, so it would not prove that
     * the label is matched through to the reward.
     */
    public function testItMatchesDefaultsInAnotherLanguage(): void
    {
        $this->givenAWheelWithSlices([
            ['再试一次', 40],
            ['下单立减 5%', 60],
        ]);

        $this->upgrade()->run();

        $slices = $this->connection->fetchAllAssociative(
            'SELECT p.name, r.type FROM prize p INNER JOIN reward r ON r.id = p.reward_id '
            .'ORDER BY p.position',
        );

        self::assertSame(RewardType::Nothing->value, $slices[0]['type']);
        self::assertSame(RewardType::PercentOff->value, $slices[1]['type']);
        self::assertSame(6, $this->countRows('reward'), 'the defaults were enough; nothing was invented');
    }

    /** P02 R11, R12 */
    public function testItInventsAFreeProductForASliceItDoesNotRecognise(): void
    {
        $this->givenAWheelWithSlices([
            ['Try again', 50],
            ['Bouteille de 50ml', 50],
        ]);

        $steps = $this->upgrade()->run();

        $invented = $this->connection->fetchAssociative(
            "SELECT name, type, value FROM reward WHERE name = 'Bouteille de 50ml'",
        );

        self::assertNotFalse($invented);
        self::assertSame(RewardType::FreeProduct->value, $invented['type']);
        self::assertNull($invented['value']);

        // R4: the operator is told what was guessed, because a free product
        // standing in for a discount is theirs to correct.
        self::assertStringContainsString('Bouteille de 50ml', $this->detailOf($steps, 'a reward for every slice'));
    }

    /**
     * P02 R12. The most tempting thing to do here is read "10% off" and write
     * percent_off with a value of 10. This test exists to keep that out: a
     * discount this code invented is money nobody authorised.
     */
    public function testItNeverReadsADiscountOutOfASliceName(): void
    {
        $this->givenAWheelWithSlices([
            ['Try again', 50],
            ['15% off everything', 50],
        ]);

        $this->upgrade()->run();

        $invented = $this->connection->fetchAssociative(
            "SELECT type, value FROM reward WHERE name = '15% off everything'",
        );

        self::assertNotFalse($invented);
        self::assertSame(RewardType::FreeProduct->value, $invented['type']);
        self::assertNull($invented['value'], 'no value was guessed out of the name');
    }

    /**
     * P02 R13. Two slices called the same thing are the same thing, so they
     * share one reward rather than producing two identical catalogue rows
     * for the admin to notice and delete.
     */
    public function testTwoSlicesWithOneNameShareAReward(): void
    {
        $this->givenAWheelWithSlices([
            ['Mystery box', 50],
            ['Mystery box', 50],
        ]);

        $this->upgrade()->run();

        self::assertSame(
            1,
            $this->countWhere('reward', "name = 'Mystery box'"),
            'one reward, not two',
        );

        $rewardIds = $this->connection->fetchFirstColumn('SELECT reward_id FROM prize ORDER BY position');
        self::assertCount(2, $rewardIds);
        self::assertCount(1, array_unique($rewardIds), 'both slices point at it');
    }

    /** P02 R13: names differing only in case are one reward, not two. */
    public function testItDoesNotInventTwoRewardsForOneNameTypedTwoWays(): void
    {
        $this->givenAWheelWithSlices([
            ['Mystery Box', 50],
            ['mystery box ', 50],
        ]);

        $this->upgrade()->run();

        self::assertSame(1, $this->countRows('reward') - 6, 'one reward was invented, not two');
    }

    /** P02 R13: a name is shortened to fit rather than refused. */
    public function testItShortensAnOverlongName(): void
    {
        // A prize name may be 40 characters and a reward name 60, so this can
        // only ever bite if either limit changes. The guard is cheap and a
        // failed INSERT in the middle of a schema upgrade is not.
        $this->givenAWheelWithSlices([[str_repeat('a', 40), 100]]);

        $this->upgrade()->run();

        $name = $this->connection->fetchOne("SELECT name FROM reward WHERE name LIKE 'aaa%'");

        self::assertIsString($name);
        self::assertLessThanOrEqual(60, mb_strlen($name));
    }

    /** P02 R8 */
    public function testItMakesTheSliceRewardRequiredWithItsForeignKey(): void
    {
        $this->givenTheDefaultWheel();

        $this->upgrade()->run();

        $column = $this->columnOf('prize', 'reward_id');
        self::assertNotNull($column);
        self::assertTrue($column->getNotnull(), 'reward_id ended up NOT NULL');

        $keys = array_map(
            static fn ($key): string => strtoupper($key->getName()),
            $this->connection->createSchemaManager()->listTableForeignKeys('prize'),
        );

        self::assertContains('FK_51C88BC1E466ACA1', $keys);
    }

    /** P02 R15 */
    public function testItTypesEverySpinFromTheSliceItWasWonOn(): void
    {
        $this->givenTheDefaultWheel();
        $prizes = $this->connection->fetchAllAssociative('SELECT id, name FROM prize ORDER BY position');
        $this->givenASpin($prizes[0]['id'], 'Try again', 40);
        $this->givenASpin($prizes[2]['id'], '10% off your next order', 15);

        $this->upgrade()->run();

        $spins = $this->connection->fetchAllAssociative(
            'SELECT prize_name, reward_type, reward_value, reward_code, claimed_at FROM spin ORDER BY id',
        );

        self::assertSame(RewardType::Nothing->value, $spins[0]['reward_type']);
        self::assertNull($spins[0]['reward_value']);

        self::assertSame(RewardType::PercentOff->value, $spins[1]['reward_type']);
        self::assertSame(10, (int) $spins[1]['reward_value']);
    }

    /** P02 R16 */
    public function testItTypesASpinWhoseSliceIsGoneAsAFreeProduct(): void
    {
        $this->givenTheDefaultWheel();
        $this->givenASpin(null, 'Something that no longer exists', 10);

        $this->upgrade()->run();

        self::assertSame(
            RewardType::FreeProduct->value,
            $this->connection->fetchOne('SELECT reward_type FROM spin'),
        );
    }

    /**
     * P02 R17. A code is what a player was shown. Minting one now would put
     * a code in the log that nobody has ever been given, and the claim would
     * then be made against a proof that does not exist.
     */
    public function testItMintsNoCodesForSpinsAlreadyRecorded(): void
    {
        $this->givenTheDefaultWheel();
        $prizes = $this->connection->fetchAllAssociative('SELECT id FROM prize ORDER BY position');
        $this->givenASpin($prizes[1]['id'], '5% off your next order', 25);

        $this->upgrade()->run();

        self::assertNull($this->connection->fetchOne('SELECT reward_code FROM spin'));
        self::assertNull($this->connection->fetchOne('SELECT claimed_at FROM spin'));
    }

    /** P02 R17: many null codes are allowed under the unique index. */
    public function testManySpinsMayHaveNoCode(): void
    {
        $this->givenTheDefaultWheel();
        $prizes = $this->connection->fetchAllAssociative('SELECT id FROM prize ORDER BY position');

        foreach (range(1, 5) as $ignored) {
            $this->givenASpin($prizes[1]['id'], '5% off your next order', 25);
        }

        $this->upgrade()->run();

        self::assertSame(5, $this->countWhere('spin', 'reward_code IS NULL'));
    }

    /**
     * P02 R17, R18. The upgrade leaves a column that is both unique and full
     * of nulls, which is the one thing about the end state that only an
     * upgraded database ever has. A spin recorded *after* the upgrade must
     * still be able to carry a code, and two of them must still collide.
     */
    public function testAFreshSpinStillTakesAUniqueCodeAfterwards(): void
    {
        $this->givenTheDefaultWheel();
        $prizes = $this->connection->fetchAllAssociative('SELECT id FROM prize ORDER BY position');

        foreach (range(1, 27) as $ignored) {
            $this->givenASpin($prizes[1]['id'], '5% off your next order', 25);
        }

        $this->upgrade()->run();

        $this->connection->insert('spin', [
            'prize_name' => '5% off your next order',
            'prize_probability' => 25,
            'spun_at' => '2026-11-16 09:00:00',
            'prize_id' => $prizes[1]['id'],
            'reward_type' => RewardType::PercentOff->value,
            'reward_value' => 5,
            'reward_code' => 'ABCD-2345',
        ]);

        self::assertSame(1, $this->countWhere('spin', "reward_code = 'ABCD-2345'"));

        $this->expectException(UniqueConstraintViolationException::class);

        $this->connection->insert('spin', [
            'prize_name' => '5% off your next order',
            'prize_probability' => 25,
            'spun_at' => '2026-11-16 09:01:00',
            'prize_id' => $prizes[1]['id'],
            'reward_type' => RewardType::PercentOff->value,
            'reward_value' => 5,
            'reward_code' => 'ABCD-2345',
        ]);
    }

    /** P02 R14 */
    public function testItTurnsTheLosingToggleOnForAWheelWithALosingSlice(): void
    {
        $this->givenTheDefaultWheel();

        $this->upgrade()->run();

        self::assertSame(1, (int) $this->connection->fetchOne('SELECT includes_losing_slice FROM wheel'));
    }

    /** P02 R14 */
    public function testItLeavesTheLosingToggleOffForAWheelWithoutOne(): void
    {
        $this->givenAWheelWithSlices([
            ['Free sample', 50],
            ['Free gift', 50],
        ]);

        $this->upgrade()->run();

        self::assertSame(0, (int) $this->connection->fetchOne('SELECT includes_losing_slice FROM wheel'));
    }

    /** P02 R19 */
    public function testItGivesExistingBrandingTheDefaultCurrency(): void
    {
        $this->givenTheDefaultWheel();
        $this->connection->insert('branding', [
            'company_name' => 'Korean Cosmetics',
            'theme' => 'birthday',
            'updated_at' => '2026-11-15 00:44:23',
        ]);

        $this->upgrade()->run();

        self::assertSame('VND', $this->connection->fetchOne('SELECT currency FROM branding'));
        self::assertSame(
            'Korean Cosmetics',
            $this->connection->fetchOne('SELECT company_name FROM branding'),
            'the branding already there was not disturbed',
        );
    }

    /** P02 R3 */
    public function testASecondRunChangesNothing(): void
    {
        $this->givenTheDefaultWheel();
        $prizes = $this->connection->fetchAllAssociative('SELECT id FROM prize ORDER BY position');
        $this->givenASpin($prizes[0]['id'], 'Try again', 40);

        $this->upgrade()->run();

        $before = $this->snapshot();

        $steps = $this->upgrade()->run();

        self::assertSame($before, $this->snapshot());
        self::assertSame(
            [],
            array_values(array_filter($steps, static fn (UpgradeStep $step): bool => $step->changed)),
            'every step found nothing to do',
        );
    }

    /** P02 R3: the data is the point, not just the schema. */
    public function testItKeepsTheRowsItFound(): void
    {
        $this->givenTheDefaultWheel();
        $this->connection->insert('player', [
            'phone' => '+84901234567',
            'first_name' => 'Mai',
            'last_name' => 'Nguyen',
            'birthday' => '1996-03-04',
            'created_at' => '2026-11-14 10:00:00',
        ]);
        $player = (int) $this->connection->lastInsertId();
        $prizes = $this->connection->fetchAllAssociative('SELECT id FROM prize ORDER BY position');

        foreach (range(1, 27) as $ignored) {
            $this->givenASpin($prizes[0]['id'], 'Try again', 40, $player);
        }

        $this->upgrade()->run();

        self::assertSame(27, $this->countRows('spin'));
        self::assertSame(1, $this->countRows('player'));
        self::assertSame(6, $this->countRows('prize'));
        self::assertSame(
            27,
            $this->countWhere('spin', 'player_id = '.$player),
            'every spin still knows who spun it',
        );
    }

    /** P02 R2, section 8: a dry run reports the plan and writes nothing. */
    public function testADryRunChangesNothing(): void
    {
        $this->givenTheDefaultWheel();

        $before = $this->snapshot();
        $steps = $this->upgrade()->run(true);

        self::assertSame($before, $this->snapshot());
        self::assertFalse($this->connection->createSchemaManager()->tablesExist(['reward']));
        self::assertNotSame(
            [],
            array_filter($steps, static fn (UpgradeStep $step): bool => $step->changed),
            'it still said there was work to do',
        );
    }

    /**
     * P02 R8: the structural steps commit on their own, so a run that stops
     * part way can be resumed. Proven by running the upgrade against a
     * database already half-changed by hand.
     */
    public function testItResumesFromAHalfFinishedUpgrade(): void
    {
        $this->givenTheDefaultWheel();

        // As far as the first two steps, and no further.
        $this->connection->executeStatement(
            'CREATE TABLE reward (id INT AUTO_INCREMENT NOT NULL, name VARCHAR(60) NOT NULL, '
            .'type VARCHAR(20) NOT NULL, value SMALLINT DEFAULT NULL, created_at DATETIME NOT NULL, '
            .'UNIQUE INDEX uniq_reward_name (name), PRIMARY KEY (id)) '
            .'DEFAULT CHARACTER SET utf8mb4 ENGINE = InnoDB',
        );
        $this->connection->executeStatement('ALTER TABLE prize ADD reward_id INT DEFAULT NULL');

        $this->upgrade()->run();

        self::assertSame(0, $this->countWhere('prize', 'reward_id IS NULL'));
        self::assertTrue($this->columnOf('prize', 'reward_id')?->getNotnull());
    }

    private function upgrade(): DatabaseUpgrade
    {
        $container = static::getContainer();

        /** @var TranslatorInterface $translator */
        $translator = $container->get(TranslatorInterface::class);

        /** @var list<string> $locales */
        $locales = $container->getParameter('kernel.enabled_locales');

        return new DatabaseUpgrade($this->connection, $translator, $locales);
    }

    /** The six slices every database that exists today was created with. */
    private function givenTheDefaultWheel(): void
    {
        $this->givenAWheelWithSlices([
            ['Try again', 40],
            ['5% off your next order', 25],
            ['10% off your next order', 15],
            ['Free sample', 10],
            ['Free gift', 7],
            ['Grand prize', 3],
        ]);
    }

    /**
     * @param list<array{0: string, 1: int}> $slices
     */
    private function givenAWheelWithSlices(array $slices): void
    {
        $this->connection->insert('wheel', ['updated_at' => '2026-11-14 16:21:32']);
        $wheel = (int) $this->connection->lastInsertId();

        foreach ($slices as $position => [$name, $probability]) {
            $this->connection->insert('prize', [
                'name' => $name,
                'probability' => $probability,
                'position' => $position,
                'wheel_id' => $wheel,
            ]);
        }
    }

    private function givenASpin(?int $prizeId, string $prizeName, int $probability, ?int $playerId = null): void
    {
        $this->connection->insert('spin', [
            'prize_name' => $prizeName,
            'prize_probability' => $probability,
            'spun_at' => '2026-11-15 00:45:27',
            'prize_id' => $prizeId,
            'player_id' => $playerId,
        ]);
    }

    /**
     * Everything the upgrade could disturb, in one comparable value.
     *
     * @return array<string, mixed>
     */
    private function snapshot(): array
    {
        return [
            'wheel' => $this->connection->fetchAllAssociative(
                'SELECT id, updated_at'
                .(null === $this->columnOf('wheel', 'includes_losing_slice') ? '' : ', includes_losing_slice')
                .' FROM wheel ORDER BY id',
            ),
            'prize' => $this->connection->fetchAllAssociative(
                'SELECT id, name, probability, position, wheel_id'
                .(null === $this->columnOf('prize', 'reward_id') ? '' : ', reward_id')
                .' FROM prize ORDER BY id',
            ),
            // The reward columns only exist after the upgrade has added
            // them, and this is also called before it runs.
            'spin' => $this->connection->fetchAllAssociative(
                'SELECT id, prize_name, prize_probability, spun_at, prize_id, player_id'
                .(null === $this->columnOf('spin', 'reward_type')
                    ? ''
                    : ', reward_type, reward_value, reward_code, claimed_at')
                .' FROM spin ORDER BY id',
            ),
            'player' => $this->connection->fetchAllAssociative('SELECT * FROM player ORDER BY id'),
            'reward' => $this->tableExists('reward')
                ? $this->connection->fetchAllAssociative('SELECT id, name, type, value FROM reward ORDER BY id')
                : null,
        ];
    }

    /**
     * @param list<UpgradeStep> $steps
     */
    private function detailOf(array $steps, string $name): string
    {
        foreach ($steps as $step) {
            if ($name === $step->name) {
                return $step->detail;
            }
        }

        self::fail(sprintf('There is no step called "%s".', $name));
    }

    private function countRows(string $table): int
    {
        return (int) $this->connection->fetchOne('SELECT COUNT(*) FROM `'.$table.'`');
    }

    private function countWhere(string $table, string $condition): int
    {
        return (int) $this->connection->fetchOne('SELECT COUNT(*) FROM `'.$table.'` WHERE '.$condition);
    }

    private function tableExists(string $table): bool
    {
        return $this->connection->createSchemaManager()->tablesExist([$table]);
    }

    private function columnOf(string $table, string $column): ?\Doctrine\DBAL\Schema\Column
    {
        foreach ($this->connection->createSchemaManager()->listTableColumns($table) as $existing) {
            if (strtolower($column) === strtolower($existing->getName())) {
                return $existing;
            }
        }

        return null;
    }

    /**
     * A database of this test's own: created empty, dropped in tearDown.
     */
    private function freshScratchDatabase(): Connection
    {
        $this->withoutScratchDatabase(static function (Connection $admin): void {
            $admin->executeStatement('DROP DATABASE IF EXISTS `'.self::SCRATCH_DATABASE.'`');
            $admin->executeStatement(
                'CREATE DATABASE `'.self::SCRATCH_DATABASE.'` '
                .'DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci',
            );
        });

        return DriverManager::getConnection(
            ['dbname' => self::SCRATCH_DATABASE] + $this->connectionParameters(),
        );
    }

    /**
     * @param callable(Connection): mixed $work
     */
    private function withoutScratchDatabase(callable $work): void
    {
        $parameters = $this->connectionParameters();
        unset($parameters['dbname'], $parameters['path'], $parameters['url']);

        $admin = DriverManager::getConnection($parameters);

        try {
            $work($admin);
        } finally {
            $admin->close();
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function connectionParameters(): array
    {
        /** @var EntityManagerInterface $entityManager */
        $entityManager = static::getContainer()->get(EntityManagerInterface::class);

        return $entityManager->getConnection()->getParams();
    }

    /**
     * The shape every table had before F13, written out rather than
     * generated. See the note on this class.
     */
    private function createPreF13Schema(): void
    {
        $statements = [
            'CREATE TABLE wheel ('
            .'id INT AUTO_INCREMENT NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY (id)'
            .') DEFAULT CHARACTER SET utf8mb4 ENGINE = InnoDB',

            'CREATE TABLE player ('
            .'id INT AUTO_INCREMENT NOT NULL, phone VARCHAR(24) NOT NULL, '
            .'first_name VARCHAR(40) NOT NULL, last_name VARCHAR(40) NOT NULL, '
            .'birthday DATE NOT NULL, created_at DATETIME NOT NULL, '
            .'UNIQUE INDEX uniq_player_phone (phone), PRIMARY KEY (id)'
            .') DEFAULT CHARACTER SET utf8mb4 ENGINE = InnoDB',

            'CREATE TABLE branding ('
            .'id INT AUTO_INCREMENT NOT NULL, company_name VARCHAR(60) DEFAULT NULL, '
            .'campaign_name VARCHAR(60) DEFAULT NULL, '
            ."theme VARCHAR(20) DEFAULT 'plain' NOT NULL, "
            .'logo_filename VARCHAR(80) DEFAULT NULL, logo_content_type VARCHAR(40) DEFAULT NULL, '
            .'updated_at DATETIME NOT NULL, tagline VARCHAR(120) DEFAULT NULL, '
            .'PRIMARY KEY (id)'
            .') DEFAULT CHARACTER SET utf8mb4 ENGINE = InnoDB',

            'CREATE TABLE prize ('
            .'id INT AUTO_INCREMENT NOT NULL, name VARCHAR(40) NOT NULL, '
            .'probability SMALLINT NOT NULL, position SMALLINT NOT NULL, wheel_id INT NOT NULL, '
            .'UNIQUE INDEX uniq_prize_wheel_position (wheel_id, position), '
            .'INDEX IDX_51C88BC19AF5772F (wheel_id), PRIMARY KEY (id)'
            .') DEFAULT CHARACTER SET utf8mb4 ENGINE = InnoDB',

            'CREATE TABLE spin ('
            .'id INT AUTO_INCREMENT NOT NULL, prize_name VARCHAR(40) NOT NULL, '
            .'prize_probability SMALLINT NOT NULL, spun_at DATETIME NOT NULL, '
            .'prize_id INT DEFAULT NULL, player_id INT DEFAULT NULL, '
            .'INDEX idx_spin_spun_at (spun_at), INDEX IDX_120A248FBBE43214 (prize_id), '
            .'INDEX IDX_120A248F99E6F5DF (player_id), PRIMARY KEY (id)'
            .') DEFAULT CHARACTER SET utf8mb4 ENGINE = InnoDB',

            'ALTER TABLE prize ADD CONSTRAINT FK_51C88BC19AF5772F '
            .'FOREIGN KEY (wheel_id) REFERENCES wheel (id) ON DELETE CASCADE',

            'ALTER TABLE spin ADD CONSTRAINT FK_120A248FBBE43214 '
            .'FOREIGN KEY (prize_id) REFERENCES prize (id) ON DELETE SET NULL',

            'ALTER TABLE spin ADD CONSTRAINT FK_120A248F99E6F5DF '
            .'FOREIGN KEY (player_id) REFERENCES player (id) ON DELETE SET NULL',
        ];

        foreach ($statements as $statement) {
            $this->connection->executeStatement($statement);
        }
    }
}
