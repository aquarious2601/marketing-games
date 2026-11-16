<?php

declare(strict_types=1);

namespace App\Schema;

use App\Branding\Currency;
use App\Entity\Reward;
use App\Reward\RewardProvider;
use App\Reward\RewardType;
use Doctrine\DBAL\Connection;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * Brings a database holding real rows up to the current schema (P02 R1).
 *
 * This exists because F13 made `prize.reward_id` `NOT NULL` with a foreign
 * key, and `doctrine:schema:update` cannot make that change against a table
 * that already has prizes in it: it adds the column, MariaDB fills the
 * existing rows with 0, and the key then points at a reward that does not
 * exist. The structure and the data it needs have to be interleaved, which
 * is what this class does and a schema diff never can.
 *
 * Every step asks the database what is true rather than consulting a version
 * number (P02 R2). That is the whole reason there is no migration version
 * table here: there is nothing to keep in step, so nothing can fall out of
 * step. See P02 section 13 for why that was preferred to Doctrine Migrations.
 */
final class DatabaseUpgrade
{
    /**
     * The constraint and index names Doctrine generates for
     * `prize.reward_id` and `spin.reward_code`. Hard-coded because they have
     * to match what `doctrine:schema:update --dump-sql` would emit — if they
     * do not, an upgraded database still reports a pending difference and
     * the next operator cannot tell a real one from this.
     */
    private const PRIZE_REWARD_FK = 'FK_51C88BC1E466ACA1';
    private const PRIZE_REWARD_INDEX = 'IDX_51C88BC1E466ACA1';
    private const SPIN_CODE_INDEX = 'UNIQ_120A248F7604A003';

    /**
     * @param list<string> $enabledLocales
     */
    public function __construct(
        private readonly Connection $connection,
        private readonly TranslatorInterface $translator,
        private readonly array $enabledLocales,
    ) {
    }

    /**
     * Runs every step in order and returns what each one did.
     *
     * A dry run reports the same steps without writing, so the plan can be
     * read before a database with a campaign in it is touched (P02 section 8).
     *
     * @return list<UpgradeStep>
     *
     * @throws \RuntimeException if the database has never been created (P02 R20)
     */
    public function run(bool $dryRun = false): array
    {
        if (!$this->tableExists('wheel')) {
            throw new \RuntimeException(
                'This database has no tables yet. Create them with '
                .'"doctrine:schema:update --force --complete" first.',
            );
        }

        return [
            $this->createRewardTable($dryRun),
            $this->seedCatalogue($dryRun),
            $this->addBrandingCurrency($dryRun),
            $this->addPrizeRewardColumn($dryRun),
            $this->fillPrizeRewards($dryRun),
            $this->constrainPrizeReward($dryRun),
            $this->addSpinRewardColumns($dryRun),
            $this->fillSpinRewards($dryRun),
            $this->constrainSpinReward($dryRun),
            $this->addWheelLosingToggle($dryRun),
        ];
    }

    /** P02 R6 */
    private function createRewardTable(bool $dryRun): UpgradeStep
    {
        $name = 'reward table';

        if ($this->tableExists('reward')) {
            return UpgradeStep::skipped($name);
        }

        if (!$dryRun) {
            // Written out rather than generated, so it is exactly the table
            // the entity mapping describes and the schema diff stays empty.
            $this->connection->executeStatement(
                'CREATE TABLE reward ('
                .'id INT AUTO_INCREMENT NOT NULL, '
                .'name VARCHAR('.Reward::NAME_MAX_LENGTH.') NOT NULL, '
                .'type VARCHAR(20) NOT NULL, '
                .'value SMALLINT DEFAULT NULL, '
                .'created_at DATETIME NOT NULL, '
                .'UNIQUE INDEX uniq_reward_name (name), '
                .'PRIMARY KEY (id)'
                .') DEFAULT CHARACTER SET utf8mb4 ENGINE = InnoDB',
            );
        }

        return UpgradeStep::done($name, $this->tense($dryRun, 'create it', 'created'));
    }

    /** P02 R7 */
    private function seedCatalogue(bool $dryRun): UpgradeStep
    {
        $name = 'default rewards';

        if (!$this->tableExists('reward')) {
            return UpgradeStep::done($name, 'would create 6 (the table does not exist yet)');
        }

        if ((int) $this->connection->fetchOne('SELECT COUNT(*) FROM reward') > 0) {
            return UpgradeStep::skipped($name, 'the catalogue is not empty');
        }

        $specifications = RewardProvider::defaultSpecifications();

        if (!$dryRun) {
            foreach ($specifications as $specification) {
                $this->connection->insert('reward', [
                    // The console has no request, so this is the default
                    // locale. An admin running the upgrade in a Vietnamese
                    // shop gets English names and renames them, which is
                    // better than the alternative of guessing their language
                    // from the server's environment.
                    'name' => $this->translator->trans($specification['key']),
                    'type' => $specification['type']->value,
                    'value' => $specification['value'],
                    'created_at' => $this->now(),
                ]);
            }
        }

        return UpgradeStep::done($name, sprintf(
            $this->tense($dryRun, 'would create %d', 'created %d'),
            \count($specifications),
        ));
    }

    /** P02 R19 */
    private function addBrandingCurrency(bool $dryRun): UpgradeStep
    {
        $name = 'branding.currency';

        if ($this->columnExists('branding', 'currency')) {
            return UpgradeStep::skipped($name);
        }

        if (!$dryRun) {
            $this->connection->executeStatement(sprintf(
                "ALTER TABLE branding ADD currency VARCHAR(3) DEFAULT '%s' NOT NULL",
                Currency::DEFAULT,
            ));
        }

        return UpgradeStep::done($name, $this->tense($dryRun, 'add it', 'added'));
    }

    /** P02 R8: nullable first, so there is somewhere to put the answer. */
    private function addPrizeRewardColumn(bool $dryRun): UpgradeStep
    {
        $name = 'prize.reward_id';

        if ($this->columnExists('prize', 'reward_id')) {
            return UpgradeStep::skipped($name);
        }

        if (!$dryRun) {
            $this->connection->executeStatement('ALTER TABLE prize ADD reward_id INT DEFAULT NULL');
        }

        return UpgradeStep::done(
            $name,
            $this->tense($dryRun, 'add it, nullable for now', 'added, nullable for now'),
        );
    }

    /** P02 R9, R10, R11, R12, R13 */
    private function fillPrizeRewards(bool $dryRun): UpgradeStep
    {
        $name = 'a reward for every slice';

        if (!$this->columnExists('prize', 'reward_id')) {
            return UpgradeStep::done($name, 'would fill in every slice (the column does not exist yet)');
        }

        /** @var list<array{id: int, name: string}> $prizes */
        $prizes = $this->connection->fetchAllAssociative(
            'SELECT id, name FROM prize WHERE reward_id IS NULL ORDER BY position, id',
        );

        if ([] === $prizes) {
            return UpgradeStep::skipped($name, 'every slice already has one');
        }

        if ($dryRun) {
            return UpgradeStep::done($name, sprintf('would fill in %d', \count($prizes)));
        }

        $catalogue = $this->catalogueByName();
        $keysByName = $this->defaultNamesToKeys();
        $matched = 0;
        $invented = [];

        $this->connection->beginTransaction();

        try {
            foreach ($prizes as $prize) {
                $rewardId = $this->existingRewardFor($prize['name'], $catalogue, $keysByName);

                if (null === $rewardId) {
                    // R11, R12: a free product, never a type read out of the
                    // admin's own words. "10% off" becoming a free product is
                    // a blank to fill in; becoming percent_off with a 10 this
                    // code invented is a discount nobody authorised.
                    $inventedName = $this->rewardNameFor($prize['name']);
                    $rewardId = $this->insertReward($inventedName, RewardType::FreeProduct);

                    // R13: added to the catalogue as it is created, so a
                    // second slice with the same name finds it on the next
                    // turn of this loop rather than becoming a second row.
                    $catalogue[$this->normalise($inventedName)] = [
                        'id' => $rewardId,
                        'type' => RewardType::FreeProduct->value,
                    ];
                    $invented[] = $inventedName;
                } else {
                    ++$matched;
                }

                $this->connection->update('prize', ['reward_id' => $rewardId], ['id' => $prize['id']]);
            }

            $this->connection->commit();
        } catch (\Throwable $failure) {
            $this->connection->rollBack();

            throw $failure;
        }

        $detail = sprintf('%d recognised', $matched);

        if ([] !== $invented) {
            $detail .= sprintf(
                ', %d invented as a free product and worth checking: %s',
                \count($invented),
                implode(', ', $invented),
            );
        }

        return UpgradeStep::done($name, $detail);
    }

    /** P02 R8: the column can only be constrained once it is filled. */
    private function constrainPrizeReward(bool $dryRun): UpgradeStep
    {
        $name = 'prize.reward_id is required';

        if (!$this->columnExists('prize', 'reward_id')) {
            return UpgradeStep::done($name, 'would constrain it (the column does not exist yet)');
        }

        $unassigned = (int) $this->connection->fetchOne(
            'SELECT COUNT(*) FROM prize WHERE reward_id IS NULL',
        );

        if ($unassigned > 0) {
            if ($dryRun) {
                return UpgradeStep::done($name, 'would constrain it, once the slices are filled in');
            }

            throw new \RuntimeException(sprintf(
                '%d prizes still have no reward. The step before this one should have filled them in.',
                $unassigned,
            ));
        }

        $alreadyRequired = !$this->columnIsNullable('prize', 'reward_id');
        $hasKey = $this->foreignKeyExists('prize', self::PRIZE_REWARD_FK);

        if ($alreadyRequired && $hasKey) {
            return UpgradeStep::skipped($name);
        }

        if (!$dryRun) {
            if (!$alreadyRequired) {
                $this->connection->executeStatement(
                    'ALTER TABLE prize MODIFY reward_id INT NOT NULL',
                );
            }

            if (!$hasKey) {
                if (!$this->indexExists('prize', self::PRIZE_REWARD_INDEX)) {
                    $this->connection->executeStatement(sprintf(
                        'CREATE INDEX %s ON prize (reward_id)',
                        self::PRIZE_REWARD_INDEX,
                    ));
                }

                // RESTRICT rather than CASCADE: deleting a reward a wheel is
                // using should be refused with a message naming the slices
                // (F13 R6), not silently take the slices with it.
                $this->connection->executeStatement(sprintf(
                    'ALTER TABLE prize ADD CONSTRAINT %s FOREIGN KEY (reward_id) '
                    .'REFERENCES reward (id) ON DELETE RESTRICT',
                    self::PRIZE_REWARD_FK,
                ));
            }
        }

        return UpgradeStep::done($name, $this->tense(
            $dryRun,
            'make it NOT NULL with its foreign key',
            'made NOT NULL with its foreign key',
        ));
    }

    /** P02 R15, R16, R17 */
    private function addSpinRewardColumns(bool $dryRun): UpgradeStep
    {
        $name = 'the spin log\'s reward columns';
        $additions = [];

        if (!$this->columnExists('spin', 'reward_type')) {
            // Nullable for now, for the same reason prize.reward_id was.
            $additions[] = 'ADD reward_type VARCHAR(20) DEFAULT NULL';
        }

        if (!$this->columnExists('spin', 'reward_value')) {
            $additions[] = 'ADD reward_value SMALLINT DEFAULT NULL';
        }

        if (!$this->columnExists('spin', 'reward_code')) {
            $additions[] = 'ADD reward_code VARCHAR(12) DEFAULT NULL';
        }

        if (!$this->columnExists('spin', 'claimed_at')) {
            $additions[] = 'ADD claimed_at DATETIME DEFAULT NULL';
        }

        if ([] === $additions) {
            return UpgradeStep::skipped($name);
        }

        if (!$dryRun) {
            $this->connection->executeStatement(
                'ALTER TABLE spin '.implode(', ', $additions),
            );
        }

        return UpgradeStep::done($name, sprintf(
            $this->tense($dryRun, 'would add %d', 'added %d'),
            \count($additions),
        ));
    }

    /** P02 R15, R16, R17 */
    private function fillSpinRewards(bool $dryRun): UpgradeStep
    {
        $name = 'what each recorded spin won';

        if (!$this->columnExists('spin', 'reward_type')) {
            return UpgradeStep::done($name, 'would type every spin (the columns do not exist yet)');
        }

        $untyped = (int) $this->connection->fetchOne(
            'SELECT COUNT(*) FROM spin WHERE reward_type IS NULL',
        );

        if (0 === $untyped) {
            return UpgradeStep::skipped($name, 'every spin is already typed');
        }

        if ($dryRun) {
            return UpgradeStep::done($name, sprintf('would type %d', $untyped));
        }

        $this->connection->beginTransaction();

        try {
            // R15: from the reward the spin's prize now points at, which the
            // step above has just decided. The spin log is a snapshot by
            // design (F13 R20), so this writes values rather than a join.
            $fromPrize = $this->connection->executeStatement(
                'UPDATE spin s '
                .'INNER JOIN prize p ON p.id = s.prize_id '
                .'INNER JOIN reward r ON r.id = p.reward_id '
                .'SET s.reward_type = r.type, s.reward_value = r.value '
                .'WHERE s.reward_type IS NULL',
            );

            // R16: the prize was deleted, so nothing survives that says what
            // this was. A free product claims by presence at the counter,
            // which is the only claim a row with no history can honestly
            // support.
            $orphaned = $this->connection->executeStatement(sprintf(
                "UPDATE spin SET reward_type = '%s', reward_value = NULL WHERE reward_type IS NULL",
                RewardType::FreeProduct->value,
            ));

            $this->connection->commit();
        } catch (\Throwable $failure) {
            $this->connection->rollBack();

            throw $failure;
        }

        // R17 is a decision not to act: no codes are minted here, so there
        // is nothing to report about them.
        $detail = sprintf('%d from their slice', $fromPrize);

        if ($orphaned > 0) {
            $detail .= sprintf(', %d whose slice is gone typed as a free product', $orphaned);
        }

        return UpgradeStep::done($name, $detail);
    }

    private function constrainSpinReward(bool $dryRun): UpgradeStep
    {
        $name = 'spin.reward_type is required';

        if (!$this->columnExists('spin', 'reward_type')) {
            return UpgradeStep::done($name, 'would constrain it (the column does not exist yet)');
        }

        $untyped = (int) $this->connection->fetchOne(
            'SELECT COUNT(*) FROM spin WHERE reward_type IS NULL',
        );

        if ($untyped > 0) {
            if ($dryRun) {
                return UpgradeStep::done($name, 'would constrain it, once the spins are typed');
            }

            throw new \RuntimeException(sprintf(
                '%d spins still have no reward type. The step before this one should have typed them.',
                $untyped,
            ));
        }

        $alreadyRequired = !$this->columnIsNullable('spin', 'reward_type');
        $hasIndex = $this->indexExists('spin', self::SPIN_CODE_INDEX);

        if ($alreadyRequired && $hasIndex) {
            return UpgradeStep::skipped($name);
        }

        if (!$dryRun) {
            if (!$alreadyRequired) {
                $this->connection->executeStatement(
                    'ALTER TABLE spin MODIFY reward_type VARCHAR(20) NOT NULL',
                );
            }

            if (!$hasIndex) {
                // Unique, and the column is nullable: MySQL allows any number
                // of NULLs in a unique index, which is what lets every spin
                // the upgrade touched keep a null code (R17) while every code
                // issued from now on is still unique (F13 R19).
                $this->connection->executeStatement(sprintf(
                    'CREATE UNIQUE INDEX %s ON spin (reward_code)',
                    self::SPIN_CODE_INDEX,
                ));
            }
        }

        return UpgradeStep::done($name, $this->tense(
            $dryRun,
            'make it NOT NULL, and codes unique',
            'made NOT NULL, and codes made unique',
        ));
    }

    /** P02 R14 */
    private function addWheelLosingToggle(bool $dryRun): UpgradeStep
    {
        $name = 'the losing-slice toggle';
        $exists = $this->columnExists('wheel', 'includes_losing_slice');

        if (!$exists && !$dryRun) {
            $this->connection->executeStatement(
                'ALTER TABLE wheel ADD includes_losing_slice TINYINT(1) DEFAULT 0 NOT NULL',
            );
        }

        if (!$this->columnExists('prize', 'reward_id') || !$this->tableExists('reward')) {
            return UpgradeStep::done($name, 'would set it from the wheel (the slices are not linked yet)');
        }

        // The toggle is not a preference stored apart from the wheel: it says
        // whether this wheel has a losing slice, and the wheel already knows.
        // Deriving it is the only way the two cannot disagree (F13 R14).
        $losing = (int) $this->connection->fetchOne(sprintf(
            'SELECT COUNT(*) FROM prize p INNER JOIN reward r ON r.id = p.reward_id '
            ."WHERE r.type = '%s'",
            RewardType::Nothing->value,
        ));

        $wanted = $losing > 0 ? 1 : 0;

        if ($dryRun) {
            return UpgradeStep::done($name, sprintf(
                'would %sset it to %s',
                $exists ? '' : 'add it and ',
                $wanted ? 'on' : 'off',
            ));
        }

        // R3: only written when it is wrong. An UPDATE that sets a column to
        // what it already holds is not a change, and a step that reports one
        // makes a second run look like it did something.
        $wrong = (int) $this->connection->fetchOne(
            'SELECT COUNT(*) FROM wheel WHERE includes_losing_slice <> :on',
            ['on' => $wanted],
        );

        if (!$exists || $wrong > 0) {
            $this->connection->executeStatement(
                'UPDATE wheel SET includes_losing_slice = :on',
                ['on' => $wanted],
            );

            return UpgradeStep::done($name, sprintf(
                '%sset to %s',
                $exists ? '' : 'added and ',
                $wanted ? 'on' : 'off',
            ));
        }

        return UpgradeStep::skipped($name, sprintf('already %s', $wanted ? 'on' : 'off'));
    }

    /**
     * The reward a prize's name points at, or null if nothing recognises it.
     *
     * @param array<string, array{id: int, type: string}> $catalogue
     * @param array<string, string>                       $keysByName
     */
    private function existingRewardFor(string $prizeName, array $catalogue, array $keysByName): ?int
    {
        $normalised = $this->normalise($prizeName);

        // The common case, and not only for an untouched wheel: slices 1–5 of
        // the default wheel are labelled with their reward's name (F13 R8).
        if (isset($catalogue[$normalised])) {
            return $catalogue[$normalised]['id'];
        }

        $key = $keysByName[$normalised] ?? null;

        if (null === $key) {
            return null;
        }

        // R10. The losing reward is found by type rather than by name,
        // exactly as RewardProvider::losing() does, so an admin who renamed
        // it to "Better luck next time" gets theirs rather than a second one.
        if (Reward::DEFAULT_LOSING_KEY === $key) {
            foreach ($catalogue as $reward) {
                if (RewardType::Nothing->value === $reward['type']) {
                    return $reward['id'];
                }
            }

            return null;
        }

        // R9. The catalogue may have been seeded in a different language from
        // the one the wheel was configured in, so every locale is tried.
        foreach ($this->enabledLocales as $locale) {
            $candidate = $this->normalise($this->translator->trans($key, [], null, $locale));

            if (isset($catalogue[$candidate])) {
                return $catalogue[$candidate]['id'];
            }
        }

        return null;
    }

    /**
     * Every default name, in every supported language, mapped to its key
     * (P02 R9, R10).
     *
     * The losing slice's *label* is in here beside the reward names, because
     * the two are deliberately different words — a wheel ships with a slice
     * reading "Try again" whose reward is called "Maybe next time" (F13 R8),
     * and an upgrade that did not know that would invent a free product for
     * the one slice that must never be claimable.
     *
     * @return array<string, string>
     */
    private function defaultNamesToKeys(): array
    {
        $keys = array_map(
            static fn (array $specification): string => $specification['key'],
            RewardProvider::defaultSpecifications(),
        );
        $keys[] = 'wheel.default_losing_label';

        $names = [];

        foreach ($keys as $key) {
            foreach ($this->enabledLocales as $locale) {
                $name = $this->normalise($this->translator->trans($key, [], null, $locale));

                // The losing label and the losing reward share a key here, so
                // both reach the type lookup in existingRewardFor().
                $names[$name] = 'wheel.default_losing_label' === $key
                    ? Reward::DEFAULT_LOSING_KEY
                    : $key;
            }
        }

        return $names;
    }

    /**
     * @return array<string, array{id: int, type: string}>
     */
    private function catalogueByName(): array
    {
        $catalogue = [];

        /** @var list<array{id: int, name: string, type: string}> $rows */
        $rows = $this->connection->fetchAllAssociative('SELECT id, name, type FROM reward ORDER BY id');

        foreach ($rows as $row) {
            $catalogue[$this->normalise($row['name'])] = [
                'id' => (int) $row['id'],
                'type' => $row['type'],
            ];
        }

        return $catalogue;
    }

    /**
     * What to call a reward invented for a slice (P02 R13).
     *
     * Truncated rather than refused, and no attempt is made to make it
     * unique: a prize name may be 40 characters and a reward name 60, and a
     * name already in the catalogue was matched before this was reached. Two
     * slices called the same thing therefore share one reward, which is
     * right — they *are* the same thing, and two identical rows in the
     * catalogue would be an upgrade artefact for the admin to clean up.
     */
    private function rewardNameFor(string $prizeName): string
    {
        $name = trim($prizeName);

        return '' === $name ? 'Reward' : mb_substr($name, 0, Reward::NAME_MAX_LENGTH);
    }

    private function insertReward(string $name, RewardType $type): int
    {
        $this->connection->insert('reward', [
            'name' => $name,
            'type' => $type->value,
            'value' => null,
            'created_at' => $this->now(),
        ]);

        return (int) $this->connection->lastInsertId();
    }

    /**
     * A dry run reports a plan, so it may not claim to have done anything
     * (P02 section 8). One helper rather than a conditional in ten places.
     */
    private function tense(bool $dryRun, string $future, string $past): string
    {
        return $dryRun ? (str_starts_with($future, 'would ') ? $future : 'would '.$future) : $past;
    }

    /**
     * Compared without case or surrounding space, so "Free Sample " and
     * "Free sample" are not two rewards for one prize.
     */
    private function normalise(string $name): string
    {
        return mb_strtolower(trim($name));
    }

    /**
     * UTC, like every other timestamp this application writes. The column is
     * a naive DATETIME, so the process timezone is what decides what lands in
     * it — see the note in Kernel::boot().
     */
    private function now(): string
    {
        return (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->format('Y-m-d H:i:s');
    }

    private function tableExists(string $table): bool
    {
        return $this->connection->createSchemaManager()->tablesExist([$table]);
    }

    private function columnExists(string $table, string $column): bool
    {
        if (!$this->tableExists($table)) {
            return false;
        }

        foreach ($this->connection->createSchemaManager()->listTableColumns($table) as $existing) {
            if (strtolower($column) === strtolower($existing->getName())) {
                return true;
            }
        }

        return false;
    }

    private function columnIsNullable(string $table, string $column): bool
    {
        foreach ($this->connection->createSchemaManager()->listTableColumns($table) as $existing) {
            if (strtolower($column) === strtolower($existing->getName())) {
                return !$existing->getNotnull();
            }
        }

        return false;
    }

    private function indexExists(string $table, string $index): bool
    {
        if (!$this->tableExists($table)) {
            return false;
        }

        foreach ($this->connection->createSchemaManager()->listTableIndexes($table) as $existing) {
            if (strtolower($index) === strtolower($existing->getName())) {
                return true;
            }
        }

        return false;
    }

    private function foreignKeyExists(string $table, string $key): bool
    {
        if (!$this->tableExists($table)) {
            return false;
        }

        foreach ($this->connection->createSchemaManager()->listTableForeignKeys($table) as $existing) {
            if (strtolower($key) === strtolower($existing->getName())) {
                return true;
            }
        }

        return false;
    }
}
