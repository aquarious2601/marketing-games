<?php

declare(strict_types=1);

namespace App\Schema;

use App\Entity\Game;
use App\Entity\Reward;
use App\Game\GameType;
use App\Game\LinkKey;
use App\Player\PhoneMatch;
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

    /** F27's keys, taken from what doctrine:schema:update asks for. */
    private const GAME_STORE_FK = 'FK_232B318CB092A811';
    private const GAME_STORE_INDEX = 'IDX_232B318CB092A811';
    private const WHEEL_GAME_FK = 'FK_61D0AF74E48FD905';
    private const WHEEL_GAME_INDEX = 'UNIQ_61D0AF74E48FD905';
    private const SPIN_GAME_FK = 'FK_120A248FE48FD905';
    private const SPIN_GAME_INDEX = 'IDX_120A248FE48FD905';

    /** F28's keys, likewise taken from what the schema diff asks for. */
    private const GIFT_GAME_FK = 'FK_A47C990DE48FD905';
    private const GIFT_GAME_INDEX = 'IDX_A47C990DE48FD905';
    private const GIFT_REWARD_FK = 'FK_A47C990DE466ACA1';
    private const GIFT_REWARD_INDEX = 'IDX_A47C990DE466ACA1';

    /**
     * Named in the mapping rather than generated, like `uniq_player_phone`
     * beside it, so this is the name the entity asks for and not a hash
     * anybody has to decode.
     */
    private const PLAYER_TAIL_INDEX = 'idx_player_phone_tail';

    /**
     * @param list<string> $enabledLocales
     */
    public function __construct(
        private readonly Connection $connection,
        private readonly TranslatorInterface $translator,
        private readonly array $enabledLocales,
        private readonly string $appTimezone,
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
            $this->widenRewardValue($dryRun),
            $this->seedCatalogue($dryRun),
            $this->addBrandingCurrency($dryRun),
            $this->unchooseACurrencyNobodyPicked($dryRun),
            $this->addPrizeRewardColumn($dryRun),
            $this->fillPrizeRewards($dryRun),
            $this->constrainPrizeReward($dryRun),
            $this->addSpinRewardColumns($dryRun),
            $this->fillSpinRewards($dryRun),
            $this->constrainSpinReward($dryRun),
            $this->addWheelLosingToggle($dryRun),
            $this->addPlayerPhoneTail($dryRun),
            $this->fillPlayerPhoneTails($dryRun),
            $this->constrainPlayerPhoneTail($dryRun),
            $this->addBrandingDailySpinLimit($dryRun),
            $this->widenNamesToTheCatalogueLimit($dryRun),
            $this->dropPrizeName($dryRun),
            $this->renameBrandingToStore($dryRun),
            $this->addStoreLanguageAndClock($dryRun),
            $this->createGameTable($dryRun),
            $this->makeTodaysCampaignAGame($dryRun),
            $this->addWheelGame($dryRun),
            $this->addSpinGame($dryRun),
            $this->dropWhatMovedToTheGame($dryRun),
            $this->createGiftTable($dryRun),
            $this->addSheetToSpins($dryRun),
            $this->giveEachGameItsTheme($dryRun),
            $this->dropStoreTheme($dryRun),
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
                // F21 R1: INT, not SMALLINT. A smallint stops at 32,767,
                // which is not a price in dong.
                .'value INT DEFAULT NULL, '
                .'created_at DATETIME NOT NULL, '
                .'UNIQUE INDEX uniq_reward_name (name), '
                .'PRIMARY KEY (id)'
                .') DEFAULT CHARACTER SET utf8mb4 ENGINE = InnoDB',
            );
        }

        return UpgradeStep::done($name, $this->tense($dryRun, 'create it', 'created'));
    }

    /**
     * P02 R26. Widens the amount columns from SMALLINT to INT (F21 R6).
     *
     * Before the catalogue is seeded and before anything writes an amount,
     * so no step after this one can be the one that overflows.
     *
     * No value is touched. A row holding exactly 32,767 may be a truncated
     * 50,000 or an admin who meant 32,767, and nothing stored can tell the
     * two apart — so this widens the column and leaves the contents alone
     * (F21 R7).
     */
    private function widenRewardValue(bool $dryRun): UpgradeStep
    {
        $name = 'amounts hold a real price';

        // Both columns, because a catalogue that can hold 50,000 and a spin
        // log that cannot would move the 500 from the admin screen to the
        // player's (F21 R1). The spin columns may not exist yet on a
        // pre-F13 database; the step that adds them makes them INT.
        $widened = [];

        foreach ([['reward', 'value'], ['spin', 'reward_value']] as [$table, $column]) {
            if ('smallint' !== $this->columnTypeOf($table, $column)) {
                continue;
            }

            if (!$dryRun) {
                $this->connection->executeStatement(sprintf(
                    'ALTER TABLE %s MODIFY %s INT DEFAULT NULL',
                    $table,
                    $column,
                ));
            }

            $widened[] = $table.'.'.$column;
        }

        if ([] === $widened) {
            if (!$this->tableExists('reward')) {
                return UpgradeStep::done($name, 'would widen them (the tables do not exist yet)');
            }

            return UpgradeStep::skipped($name);
        }

        return UpgradeStep::done($name, sprintf(
            $this->tense($dryRun, 'would widen %s to INT', 'widened %s to INT'),
            implode(' and ', $widened),
        ));
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

    /**
     * F23 R1, P02 R19.
     *
     * Nullable and left null, for the same reason the currency above is:
     * null means nobody has set a limit, and a campaign that predates the
     * column has indeed never set one. Choosing a number here would be this
     * code deciding how often a shop's customers may play.
     */
    private function addBrandingDailySpinLimit(bool $dryRun): UpgradeStep
    {
        $name = 'branding.daily_spin_limit';

        $shop = $this->shopTable();

        /*
         * F27 R11 moved the limit to the game, and the step that drops it
         * from the shop runs after this one. Without this guard the two would
         * take turns for ever: added here, dropped there, every run.
         *
         * The game table existing is the signal, because that is what the
         * move leaves behind. Before it exists this step is still the only
         * thing that gives an old database a limit to carry over (R32).
         */
        if ($this->tableExists('game')) {
            return UpgradeStep::skipped($name, "the game carries it now");
        }

        if ($this->columnExists($shop, 'daily_spin_limit')) {
            return UpgradeStep::skipped($name);
        }

        if (!$dryRun) {
            $this->connection->executeStatement(
                'ALTER TABLE '.$shop.' ADD daily_spin_limit SMALLINT DEFAULT NULL',
            );
        }

        return UpgradeStep::done($name, $this->tense($dryRun, 'add it', 'added'));
    }

    /**
     * P02 R6, F26 R25.
     *
     * Two columns were sized to things F26 changed. `spin.prize_name` held a
     * slice label, 40 characters, and now snapshots a reward name.
     * `reward.name` held 60, chosen when it was only an admin's private word
     * for a prize rather than what the wheel says. Both become
     * Reward::NAME_MAX_LENGTH.
     *
     * Unfixed, this is the fault widenRewardValue() fixed for amounts in
     * different clothes: on a strict database the insert fails at the moment
     * somebody spins, and on a lenient one it quietly truncates the record
     * of what they won.
     *
     * Before dropPrizeName() rather than after, so a database interrupted
     * between the two is wide enough for what it is about to be asked to
     * store.
     */
    private function widenNamesToTheCatalogueLimit(bool $dryRun): UpgradeStep
    {
        $name = 'names hold a full reward name';

        // Both columns, for the reason widenRewardValue() gives about
        // amounts: a catalogue that can hold 256 characters and a spin log
        // that cannot would move the failure from the admin's screen to the
        // moment a player presses the button.
        $widened = [];

        foreach ([['reward', 'name'], ['spin', 'prize_name']] as [$table, $column]) {
            if (!$this->columnExists($table, $column)) {
                continue;
            }

            $length = $this->columnLengthOf($table, $column);

            if (null !== $length && $length >= Reward::NAME_MAX_LENGTH) {
                continue;
            }

            if (!$dryRun) {
                $this->connection->executeStatement(sprintf(
                    'ALTER TABLE %s MODIFY %s VARCHAR(%d) NOT NULL',
                    $table,
                    $column,
                    Reward::NAME_MAX_LENGTH,
                ));
            }

            $widened[] = $table.'.'.$column;
        }

        if ([] === $widened) {
            if (!$this->tableExists('reward')) {
                return UpgradeStep::done($name, 'would widen them (the reward table does not exist yet)');
            }

            return UpgradeStep::skipped($name);
        }

        return UpgradeStep::done($name, sprintf(
            $this->tense(
                $dryRun,
                'would widen %s to '.Reward::NAME_MAX_LENGTH,
                'widened %s to '.Reward::NAME_MAX_LENGTH,
            ),
            implode(' and ', $widened),
        ));
    }

    /**
     * P02 R6, F26 R7 to R9.
     *
     * Last in the list, and that is load-bearing: fillPrizeRewards() above
     * matches a slice to a reward *by this column*, so a database old enough
     * to need that step still has the name when it runs. Steps run in order
     * (P02 R3), and this one drops the column after its last reader.
     */
    private function dropPrizeName(bool $dryRun): UpgradeStep
    {
        $name = 'prize.name';

        if (!$this->columnExists('prize', 'name')) {
            return UpgradeStep::skipped($name);
        }

        /*
         * F26 R9. Named rather than counted: these are the labels a player
         * will see change, and a number tells the operator that something
         * happened while telling them nothing about what to go and look at.
         *
         * Read before the drop, obviously, and read even on a dry run — the
         * point of the dry run is to put this list in the deploy log before
         * the column is gone (P03 runs it first).
         */
        $comparable = $this->tableExists('reward') && $this->columnExists('prize', 'reward_id');

        $diverging = $comparable
            ? $this->connection->fetchAllAssociative(
                'SELECT p.name AS slice, r.name AS reward
                   FROM prize p
                   JOIN reward r ON r.id = p.reward_id
                  WHERE p.name <> r.name
                  ORDER BY p.position',
            )
            : [];

        if (!$dryRun) {
            $this->connection->executeStatement('ALTER TABLE prize DROP name');
        }

        if (!$comparable) {
            // A dry run against a database old enough to have no reward table
            // yet: the step that creates it has not really run, so there is
            // nothing to compare the labels against. The real run will.
            return UpgradeStep::done($name, sprintf(
                '%s (the labels cannot be compared until the reward table exists)',
                $this->tense($dryRun, 'drop it', 'dropped it'),
            ));
        }

        if ([] === $diverging) {
            return UpgradeStep::done($name, sprintf(
                '%s; every slice already reads its reward\'s name',
                $this->tense($dryRun, 'drop it', 'dropped it'),
            ));
        }

        $changes = array_map(
            static fn (array $row): string => sprintf('"%s" -> "%s"', $row['slice'], $row['reward']),
            $diverging,
        );

        return UpgradeStep::done($name, sprintf(
            '%s. %d label%s differed from the reward behind it; %s: %s',
            $this->tense($dryRun, 'drop it', 'dropped it'),
            \count($changes),
            1 === \count($changes) ? '' : 's',
            $dryRun ? 'each would now read the reward' : 'each now reads the reward',
            implode(', ', $changes),
        ));
    }

    /** P02 R19 */
    private function addBrandingCurrency(bool $dryRun): UpgradeStep
    {
        $name = 'branding.currency';

        $shop = $this->shopTable();

        if ($this->columnExists($shop, 'currency')) {
            return UpgradeStep::skipped($name);
        }

        if (!$dryRun) {
            // Nullable, and left null: F15 R4 made null mean "nobody has
            // chosen", and a campaign that predates the column has indeed
            // never chosen. Seeding it with a currency here would be this
            // code deciding what a shop trades in.
            $this->connection->executeStatement(
                'ALTER TABLE '.$shop.' ADD currency VARCHAR(3) DEFAULT NULL',
            );
        }

        return UpgradeStep::done($name, $this->tense($dryRun, 'add it', 'added'));
    }

    /**
     * Takes back a currency this command once wrote (P02 R21).
     *
     * The first version of the step above added the column
     * `DEFAULT 'VND' NOT NULL`, because at the time the column could not be
     * null. F15 then made null mean *nobody has chosen*, and every database
     * upgraded in between is left claiming a choice that was this code's,
     * not an admin's — which is exactly what it looks like: a French
     * campaign offering to count its rewards in đồng.
     *
     * Only `VND` is taken back, because `VND` is the only value that step
     * ever wrote; anything else was chosen by a person. And only while no
     * reward is counted in money, which is what makes this safe: with no
     * amount anywhere, there is no number whose meaning could change.
     */
    private function unchooseACurrencyNobodyPicked(bool $dryRun): UpgradeStep
    {
        $name = 'a currency nobody picked';
        $written = 'VND';

        $shop = $this->shopTable();

        if (!$this->tableExists('reward') || !$this->columnExists($shop, 'currency')) {
            return UpgradeStep::skipped($name, 'there is no currency to take back');
        }

        $candidates = (int) $this->connection->fetchOne(
            'SELECT COUNT(*) FROM '.$shop.' WHERE currency = :written',
            ['written' => $written],
        );

        if (0 === $candidates) {
            return UpgradeStep::skipped($name, 'nothing was left behind');
        }

        $amounts = (int) $this->connection->fetchOne(
            sprintf("SELECT COUNT(*) FROM reward WHERE type = '%s'", RewardType::AmountOff->value),
        );

        if ($amounts > 0) {
            // Somebody is counting in money, so the stored currency is load
            // bearing whoever wrote it. Left alone, and said out loud.
            return UpgradeStep::skipped(
                $name,
                sprintf('left as %s: %d rewards are counted in it', $written, $amounts),
            );
        }

        if ($dryRun) {
            return UpgradeStep::done($name, sprintf('would take back %s', $written));
        }

        $this->connection->executeStatement(
            'UPDATE '.$shop.' SET currency = NULL WHERE currency = :written',
            ['written' => $written],
        );

        return UpgradeStep::done(
            $name,
            sprintf('took back %s; the admin\'s language decides until they choose', $written),
        );
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

        /*
         * F26 R7 dropped the label this step matches on, and dropPrizeName()
         * runs after constrainPrizeReward() has made `reward_id` NOT NULL. So
         * a database with no `prize.name` is one where this step has already
         * finished: there can be no slice both missing a reward and missing
         * the name that would find it one.
         *
         * Without this guard the second run of an upgraded database dies
         * here, on a SELECT of a column that did its job and left.
         */
        if (!$this->columnExists('prize', 'name')) {
            return UpgradeStep::skipped($name, 'every slice already has one');
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
            // F21 R1: INT here as well as on the catalogue. This column is
            // written during a spin, so an overflow is a 500 in front of a
            // player rather than on an admin screen.
            $additions[] = 'ADD reward_value INT DEFAULT NULL';
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

        // R3: only written when it is wrong. An UPDATE that sets a column to
        // what it already holds is not a change, and a step that reports one
        // makes a second run look like it did something.
        //
        // Checked before the dry run answers, not after: a plan that claims
        // a change it would not make is worse than no plan, because the
        // whole point of --dry-run is to be believed.
        $wrong = $exists
            ? (int) $this->connection->fetchOne(
                'SELECT COUNT(*) FROM wheel WHERE includes_losing_slice <> :on',
                ['on' => $wanted],
            )
            : 0;

        if ($exists && 0 === $wrong) {
            return UpgradeStep::skipped($name, sprintf('already %s', $wanted ? 'on' : 'off'));
        }

        if ($dryRun) {
            return UpgradeStep::done($name, sprintf(
                'would %sset it to %s',
                $exists ? '' : 'add it and ',
                $wanted ? 'on' : 'off',
            ));
        }

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
    /** P02 R22: nullable first, so there is somewhere to put the answer. */
    private function addPlayerPhoneTail(bool $dryRun): UpgradeStep
    {
        $name = 'player.phone_tail';

        if ($this->columnExists('player', 'phone_tail')) {
            return UpgradeStep::skipped($name);
        }

        if (!$dryRun) {
            $this->connection->executeStatement(sprintf(
                'ALTER TABLE player ADD phone_tail VARCHAR(%d) DEFAULT NULL',
                PhoneMatch::TAIL_LENGTH,
            ));
        }

        return UpgradeStep::done($name, $this->tense($dryRun, 'add it', 'added'));
    }

    /**
     * Fills the tail of every stored number, and merges the rows that turn
     * out to be one person (P02 R23, R24).
     *
     * This step needs nothing configured, which is the point of F19 and the
     * lesson of F18: a step that first has to be told which country the
     * campaign is in does not run on the database that needs it most.
     *
     * Rows are read oldest first so the earliest registration is the one
     * that survives a merge (F19 R14) — the row whose number staff may
     * already have called, and whose history is the longer of the two.
     */
    private function fillPlayerPhoneTails(bool $dryRun): UpgradeStep
    {
        $name = 'how each stored number is found';

        if (!$this->columnExists('player', 'phone_tail')) {
            return UpgradeStep::done($name, 'would do every player (the column does not exist yet)');
        }

        $rows = $this->connection->fetchAllAssociative(
            'SELECT id, phone, phone_tail FROM player ORDER BY created_at, id',
        );

        /** @var array<string, list<array{id: int, phone: string}>> $survivors by tail, so the comparison below is between the few rows that could match */
        $survivors = [];
        /** @var array<int, string> $rewrites */
        $rewrites = [];
        /** @var array<int, int> $merges the row to delete, and the row that survives */
        $merges = [];

        foreach ($rows as $row) {
            $id = (int) $row['id'];
            $phone = (string) $row['phone'];
            $tail = PhoneMatch::tail($phone);

            $held = null;

            foreach ($survivors[$tail] ?? [] as $candidate) {
                if (PhoneMatch::same($phone, $candidate['phone'])) {
                    $held = $candidate['id'];

                    break;
                }
            }

            if (null !== $held) {
                $merges[$id] = $held;

                continue;
            }

            $survivors[$tail][] = ['id' => $id, 'phone' => $phone];

            // Recomputed for every row rather than only for the empty ones,
            // so a run that stopped half way can be resumed and a finished
            // one has nothing to write (P02 R3).
            if ($tail !== $row['phone_tail']) {
                $rewrites[$id] = $tail;
            }
        }

        if ([] === $rewrites && [] === $merges) {
            return UpgradeStep::skipped($name, 'every player can already be found');
        }

        if ($dryRun) {
            return UpgradeStep::done($name, $this->phoneTailReport(true, \count($rewrites), \count($merges)));
        }

        $this->connection->beginTransaction();

        try {
            // The merges first, and each row's spins before the row itself:
            // a prize this shop has already given away must not lose the
            // player it was given to.
            foreach ($merges as $duplicate => $survivor) {
                $this->connection->executeStatement(
                    'UPDATE spin SET player_id = :survivor WHERE player_id = :duplicate',
                    ['survivor' => $survivor, 'duplicate' => $duplicate],
                );

                $this->connection->executeStatement(
                    'DELETE FROM player WHERE id = :duplicate',
                    ['duplicate' => $duplicate],
                );
            }

            foreach ($rewrites as $id => $tail) {
                $this->connection->executeStatement(
                    'UPDATE player SET phone_tail = :tail WHERE id = :id',
                    ['tail' => $tail, 'id' => $id],
                );
            }

            $this->connection->commit();
        } catch (\Throwable $failure) {
            $this->connection->rollBack();

            throw $failure;
        }

        return UpgradeStep::done($name, $this->phoneTailReport(false, \count($rewrites), \count($merges)));
    }

    /** P02 R25 */
    private function constrainPlayerPhoneTail(bool $dryRun): UpgradeStep
    {
        $name = 'player.phone_tail is required and indexed';

        if (!$this->columnExists('player', 'phone_tail')) {
            return UpgradeStep::done($name, 'would constrain it (the column does not exist yet)');
        }

        $empty = (int) $this->connection->fetchOne(
            'SELECT COUNT(*) FROM player WHERE phone_tail IS NULL',
        );

        if ($empty > 0) {
            if ($dryRun) {
                return UpgradeStep::done($name, 'would constrain it, once the players are done');
            }

            throw new \RuntimeException(sprintf(
                '%d players still have no phone tail. The step before this one should have filled them.',
                $empty,
            ));
        }

        $alreadyRequired = !$this->columnIsNullable('player', 'phone_tail');
        $hasIndex = $this->indexExists('player', self::PLAYER_TAIL_INDEX);

        if ($alreadyRequired && $hasIndex) {
            return UpgradeStep::skipped($name);
        }

        if (!$dryRun) {
            if (!$alreadyRequired) {
                $this->connection->executeStatement(sprintf(
                    'ALTER TABLE player MODIFY phone_tail VARCHAR(%d) NOT NULL',
                    PhoneMatch::TAIL_LENGTH,
                ));
            }

            if (!$hasIndex) {
                // Not unique, deliberately: two different people can share a
                // tail, and it is PhoneMatch that tells them apart (F19 R4).
                $this->connection->executeStatement(sprintf(
                    'CREATE INDEX %s ON player (phone_tail)',
                    self::PLAYER_TAIL_INDEX,
                ));
            }
        }

        return UpgradeStep::done($name, $this->tense(
            $dryRun,
            'make it NOT NULL, and index it',
            'made NOT NULL, and indexed',
        ));
    }

    /**
     * P02 R24. Not built from tense(), which prefixes a whole sentence: this
     * detail has a second clause that has to read in the same tense as its
     * first.
     */
    private function phoneTailReport(bool $dryRun, int $filled, int $merged): string
    {
        $detail = sprintf($dryRun ? 'would do %d' : 'did %d', $filled);

        if ($merged > 0) {
            $detail .= sprintf(
                $dryRun
                    ? ', and merge %d holding a number an older row already held'
                    : ', merged %d holding a number an older row already held',
                $merged,
            );
        }

        return $detail;
    }

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

    /** F28 R1. */
    private function createGiftTable(bool $dryRun): UpgradeStep
    {
        $name = 'gift table';

        if ($this->tableExists('gift')) {
            return UpgradeStep::skipped($name);
        }

        if (!$this->tableExists('game') || !$this->tableExists('reward')) {
            return UpgradeStep::done($name, 'would create it (the tables it points at do not exist yet)');
        }

        if (!$dryRun) {
            // Exactly what doctrine:schema:update asks for, generated names
            // included, so an upgraded database reports no difference after.
            $this->connection->executeStatement(
                'CREATE TABLE gift ('
                .'id INT AUTO_INCREMENT NOT NULL, '
                .'position SMALLINT NOT NULL, '
                .'game_id INT NOT NULL, '
                .'reward_id INT NOT NULL, '
                // R2 and R6 held by the database rather than only by a form.
                .'UNIQUE INDEX uniq_gift_game_reward (game_id, reward_id), '
                .'UNIQUE INDEX uniq_gift_game_position (game_id, position), '
                .'INDEX '.self::GIFT_GAME_INDEX.' (game_id), '
                .'INDEX '.self::GIFT_REWARD_INDEX.' (reward_id), '
                .'PRIMARY KEY (id)'
                .') DEFAULT CHARACTER SET utf8mb4 ENGINE = InnoDB',
            );
            $this->connection->executeStatement(
                'ALTER TABLE gift ADD CONSTRAINT '.self::GIFT_GAME_FK
                .' FOREIGN KEY (game_id) REFERENCES game (id) ON DELETE CASCADE',
            );
            /*
             * No ON DELETE on the reward, unlike the game: F13 decides what
             * deleting a reward does, and a cascade here would quietly take
             * gifts with it and change a sheet nobody edited.
             */
            $this->connection->executeStatement(
                'ALTER TABLE gift ADD CONSTRAINT '.self::GIFT_REWARD_FK
                .' FOREIGN KEY (reward_id) REFERENCES reward (id)',
            );
        }

        return UpgradeStep::done($name, $this->tense($dryRun, 'create it', 'created'));
    }

    /**
     * F28 R19 and section 7: a spin learns which sheet it was part of, and
     * its probability learns to be absent.
     *
     * The probability is the interesting half. Every row until now was drawn
     * and had one; a gift is handed over and has none, and the column has to
     * allow that before the first sheet is issued — on this machine MariaDB
     * would quietly write a 0 and nobody would notice, and in production it
     * would refuse the insert (see the ROADMAP's strict-database entry).
     */
    private function addSheetToSpins(bool $dryRun): UpgradeStep
    {
        $name = 'a spin can be a gift';

        if (!$this->tableExists('spin')) {
            return UpgradeStep::skipped($name, 'there is no spin table');
        }

        $sheet = !$this->columnExists('spin', 'sheet_id');
        $probability = 'NO' === $this->nullabilityOf('spin', 'prize_probability');

        if (!$sheet && !$probability) {
            return UpgradeStep::skipped($name);
        }

        if (!$dryRun) {
            if ($sheet) {
                $this->connection->executeStatement(
                    'ALTER TABLE spin ADD sheet_id VARCHAR(12) DEFAULT NULL',
                );
            }

            if ($probability) {
                $this->connection->executeStatement(
                    'ALTER TABLE spin CHANGE prize_probability prize_probability SMALLINT DEFAULT NULL',
                );
            }
        }

        $what = [];

        if ($sheet) {
            $what[] = 'sheet_id';
        }

        if ($probability) {
            $what[] = 'a probability that may be absent';
        }

        return UpgradeStep::done($name, $this->tense(
            $dryRun,
            'add '.implode(' and ', $what),
            'added '.implode(' and ', $what),
        ));
    }

    /** 'YES', 'NO', or null when there is no such column. */
    private function nullabilityOf(string $table, string $column): ?string
    {
        $answer = $this->connection->fetchOne(
            'SELECT is_nullable FROM information_schema.columns '
            .'WHERE table_schema = DATABASE() AND table_name = :table AND column_name = :column',
            ['table' => $table, 'column' => $column],
        );

        return \is_string($answer) ? $answer : null;
    }

    /**
     * Whichever table the shop is in (F27 R1).
     *
     * Every step older than F27 was written against `branding`. They still
     * have to run on a database that has already been renamed, because
     * running the upgrade twice has to be running it once (P02 R2) — and a
     * step that named a table which no longer exists would throw rather than
     * skip. So they ask.
     */
    private function shopTable(): string
    {
        return $this->tableExists('store') ? 'store' : 'branding';
    }

    /**
     * F27 R1. The one branding row is the shop, so the table says so.
     *
     * A rename rather than a create-and-copy: the row has a logo filename in
     * it that points at a file on disk, and a new row with a new id would
     * leave every existing spin's history hanging off nothing.
     */
    private function renameBrandingToStore(bool $dryRun): UpgradeStep
    {
        $name = 'the branding row is the store';

        if ($this->tableExists('store')) {
            return UpgradeStep::skipped($name);
        }

        if (!$this->tableExists('branding')) {
            return UpgradeStep::skipped($name, 'there is no branding table to rename');
        }

        if (!$dryRun) {
            $this->connection->executeStatement('RENAME TABLE branding TO store');
        }

        return UpgradeStep::done($name, $this->tense($dryRun, 'rename it', 'renamed'));
    }

    /**
     * F27 R15, R17, R34. The store learns which language its player pages
     * open in and which clock its day is counted on.
     *
     * The timezone is seeded from APP_TIMEZONE in the same statement that
     * adds it, and only then: an admin who later picks UTC on purpose must
     * not have a deployment setting put back over the top of their choice.
     */
    private function addStoreLanguageAndClock(bool $dryRun): UpgradeStep
    {
        $name = 'the store has a language and a clock';

        if (!$this->tableExists('store')) {
            return UpgradeStep::done($name, 'would add them (the store table does not exist yet)');
        }

        $language = !$this->columnExists('store', 'language');
        $timezone = !$this->columnExists('store', 'timezone');

        if (!$language && !$timezone) {
            return UpgradeStep::skipped($name);
        }

        if (!$dryRun) {
            if ($language) {
                $this->connection->executeStatement(
                    'ALTER TABLE store ADD language VARCHAR(2) DEFAULT NULL',
                );
            }

            if ($timezone) {
                $this->connection->executeStatement(
                    "ALTER TABLE store ADD timezone VARCHAR(64) DEFAULT 'UTC' NOT NULL",
                );
                $this->connection->executeStatement(
                    'UPDATE store SET timezone = :zone',
                    ['zone' => $this->appTimezone],
                );
            }
        }

        return UpgradeStep::done($name, $this->tense(
            $dryRun,
            sprintf('add them, with the clock on %s', $this->appTimezone),
            sprintf('added, with the clock on %s', $this->appTimezone),
        ));
    }

    /** F27 R3. */
    private function createGameTable(bool $dryRun): UpgradeStep
    {
        $name = 'game table';

        if ($this->tableExists('game')) {
            return UpgradeStep::skipped($name);
        }

        if (!$dryRun) {
            // Exactly what doctrine:schema:update would emit, generated
            // index and constraint names included, so an upgraded database
            // reports no pending difference afterwards.
            $this->connection->executeStatement(
                'CREATE TABLE game ('
                .'id INT AUTO_INCREMENT NOT NULL, '
                .'name VARCHAR('.Game::NAME_MAX_LENGTH.') NOT NULL, '
                .'type VARCHAR(32) NOT NULL, '
                .'tagline VARCHAR('.Game::TAGLINE_MAX_LENGTH.') DEFAULT NULL, '
                .'daily_limit SMALLINT DEFAULT NULL, '
                .'link_key VARCHAR(16) NOT NULL, '
                .'is_live TINYINT DEFAULT 0 NOT NULL, '
                .'created_at DATETIME NOT NULL, '
                .'updated_at DATETIME NOT NULL, '
                .'store_id INT NOT NULL, '
                .'UNIQUE INDEX uniq_game_link_key (link_key), '
                .'INDEX '.self::GAME_STORE_INDEX.' (store_id), '
                .'PRIMARY KEY (id)'
                .') DEFAULT CHARACTER SET utf8mb4 ENGINE = InnoDB',
            );
            $this->connection->executeStatement(
                'ALTER TABLE game ADD CONSTRAINT '.self::GAME_STORE_FK
                .' FOREIGN KEY (store_id) REFERENCES store (id) ON DELETE CASCADE',
            );
        }

        return UpgradeStep::done($name, $this->tense($dryRun, 'create it', 'created'));
    }

    /**
     * F27 R32, R33. Today's campaign becomes one live wheel game.
     *
     * Live, and the only one, which is what keeps `/` serving the player
     * page (R26) so every existing link, bookmark and manual test survives
     * the upgrade.
     */
    private function makeTodaysCampaignAGame(bool $dryRun): UpgradeStep
    {
        $name = "today's campaign is a game";

        if (!$this->tableExists('game') || !$this->tableExists('store')) {
            return UpgradeStep::done($name, 'would make one (the tables do not exist yet)');
        }

        if ((int) $this->connection->fetchOne('SELECT COUNT(*) FROM game') > 0) {
            return UpgradeStep::skipped($name, 'there is already a game');
        }

        $store = $this->connection->fetchAssociative('SELECT * FROM store ORDER BY id ASC LIMIT 1');

        /*
         * A shop that never saved its branding has no row at all — which is
         * the database this step matters most for, because its wheel and its
         * spins still need a game to belong to. The application creates the
         * row on first read (F04 R1); the upgrade cannot wait for somebody to
         * open the admin.
         */
        if (false === $store) {
            if ($dryRun) {
                return UpgradeStep::done($name, 'would create the shop and one live game on its own link');
            }

            $row = [
                'timezone' => $this->appTimezone,
                'updated_at' => $this->now(),
            ];

            /*
             * Only while the column is still there. This step runs before
             * the one that drops it (F30 R11), so an upgrade in progress
             * still has it — but a database created straight from the
             * current schema never did, and naming it would fail.
             */
            if ($this->columnExists('store', 'theme')) {
                $row['theme'] = 'plain';
            }

            $this->connection->insert('store', $row);

            $store = $this->connection->fetchAssociative('SELECT * FROM store ORDER BY id ASC LIMIT 1');
            \assert(false !== $store);
        }

        // Whatever the campaign was called, then the company, then a word
        // that at least names the game: a row in a list has to be clickable
        // and nobody is present to be asked (R33).
        $title = $this->firstNonEmpty([
            $store['campaign_name'] ?? null,
            $store['company_name'] ?? null,
        ]) ?? 'Wheel';

        $key = LinkKey::mint();

        if ($dryRun) {
            return UpgradeStep::done($name, sprintf('would create "%s", live, on its own link', $title));
        }

        $this->connection->insert('game', [
            'store_id' => (int) $store['id'],
            'name' => $title,
            'type' => GameType::Wheel->value,
            'tagline' => $store['tagline'] ?? null,
            'daily_limit' => $store['daily_spin_limit'] ?? null,
            'link_key' => $key,
            'is_live' => 1,
            'created_at' => $this->now(),
            'updated_at' => $this->now(),
        ]);

        return UpgradeStep::done($name, sprintf('created "%s", live at /play/%s', $title, $key));
    }

    /** F27 R6. The wheel that was the installation's is this game's. */
    private function addWheelGame(bool $dryRun): UpgradeStep
    {
        return $this->pointAtTheGame(
            $dryRun,
            'the wheel belongs to a game',
            'wheel',
            self::WHEEL_GAME_FK,
            self::WHEEL_GAME_INDEX,
            unique: true,
        );
    }

    /** F27 R9. Every spin already recorded happened on that game. */
    private function addSpinGame(bool $dryRun): UpgradeStep
    {
        return $this->pointAtTheGame(
            $dryRun,
            'every spin names its game',
            'spin',
            self::SPIN_GAME_FK,
            self::SPIN_GAME_INDEX,
            unique: false,
        );
    }

    /**
     * Adds `game_id` to a table that already has rows in it, which is the
     * interleaving a schema diff cannot do: the column goes on nullable, the
     * existing rows are pointed at the game the step before created, and only
     * then is it constrained (P02 R4).
     */
    private function pointAtTheGame(
        bool $dryRun,
        string $name,
        string $table,
        string $foreignKey,
        string $index,
        bool $unique,
    ): UpgradeStep {
        if (!$this->tableExists($table) || !$this->tableExists('game')) {
            return UpgradeStep::done($name, 'would point it at the game (the tables do not exist yet)');
        }

        /*
         * The index rather than the constraint: MySQL satisfies the foreign
         * key with the index created beside it and never lists one of its
         * own, so a guard on the constraint's name would be false every time
         * and this step would try to create the index twice.
         */
        if ($this->columnExists($table, 'game_id') && $this->indexExists($table, $index)) {
            return UpgradeStep::skipped($name);
        }

        $game = $this->connection->fetchOne('SELECT id FROM game ORDER BY id ASC LIMIT 1');

        if (false === $game || null === $game) {
            return UpgradeStep::skipped($name, 'there is no game to point it at');
        }

        $rows = (int) $this->connection->fetchOne('SELECT COUNT(*) FROM '.$table);

        if ($dryRun) {
            return UpgradeStep::done($name, sprintf('would point %d row(s) at it', $rows));
        }

        if (!$this->columnExists($table, 'game_id')) {
            $this->connection->executeStatement('ALTER TABLE '.$table.' ADD game_id INT DEFAULT NULL');
        }

        $this->connection->executeStatement(
            'UPDATE '.$table.' SET game_id = :game WHERE game_id IS NULL',
            ['game' => (int) $game],
        );
        $this->connection->executeStatement('ALTER TABLE '.$table.' CHANGE game_id game_id INT NOT NULL');

        if (!$this->indexExists($table, $index)) {
            $this->connection->executeStatement(
                'CREATE '.($unique ? 'UNIQUE ' : '').'INDEX '.$index.' ON '.$table.' (game_id)',
            );
            $this->connection->executeStatement(
                'ALTER TABLE '.$table.' ADD CONSTRAINT '.$foreignKey
                .' FOREIGN KEY (game_id) REFERENCES game (id) ON DELETE CASCADE',
            );
        }

        return UpgradeStep::done($name, sprintf('pointed %d row(s) at it', $rows));
    }

    /**
     * F27 R11. The three columns that describe a promotion rather than a shop
     * leave the store, now that a game carries them.
     *
     * Last, and only once every game has what it needs: a dropped column is
     * the one thing in this list that cannot be undone by running it again.
     */
    private function dropWhatMovedToTheGame(bool $dryRun): UpgradeStep
    {
        $name = 'the store keeps only what every game shows';

        if (!$this->tableExists('store')) {
            return UpgradeStep::skipped($name, 'there is no store table');
        }

        $moved = array_values(array_filter(
            ['campaign_name', 'tagline', 'daily_spin_limit'],
            fn (string $column): bool => $this->columnExists('store', $column),
        ));

        if ([] === $moved) {
            return UpgradeStep::skipped($name);
        }

        if (!$this->tableExists('game')
            || 0 === (int) $this->connection->fetchOne('SELECT COUNT(*) FROM game')) {
            return UpgradeStep::skipped($name, 'no game holds them yet');
        }

        if (!$dryRun) {
            foreach ($moved as $column) {
                $this->connection->executeStatement('ALTER TABLE store DROP '.$column);
            }
        }

        return UpgradeStep::done($name, $this->tense(
            $dryRun,
            sprintf('drop %s', implode(', ', $moved)),
            sprintf('dropped %s', implode(', ', $moved)),
        ));
    }

    /**
     * F30 R10. The theme becomes the game's, and every game that exists
     * already gets the store's current one.
     *
     * Filled from the store rather than left at the default, because the one
     * game a shop has is the one the store's theme was chosen for: the point
     * of this step is that nothing looks different the moment it runs.
     */
    private function giveEachGameItsTheme(bool $dryRun): UpgradeStep
    {
        $name = 'each game carries its own theme';

        if (!$this->tableExists('game')) {
            return UpgradeStep::done($name, 'would add it (the game table does not exist yet)');
        }

        if ($this->columnExists('game', 'theme')) {
            return UpgradeStep::skipped($name);
        }

        $shop = $this->shopTable();
        $inherited = !$this->columnExists($shop, 'theme')
            ? null
            : $this->connection->fetchOne('SELECT theme FROM '.$shop.' ORDER BY id LIMIT 1');
        $theme = \is_string($inherited) && '' !== $inherited ? $inherited : 'plain';

        if ($dryRun) {
            return UpgradeStep::done($name, sprintf('would add it and set every game to %s', $theme));
        }

        $this->connection->executeStatement(
            "ALTER TABLE game ADD theme VARCHAR(20) DEFAULT 'plain' NOT NULL"
        );

        $rows = (int) $this->connection->executeStatement(
            'UPDATE game SET theme = :theme',
            ['theme' => $theme],
        );

        return UpgradeStep::done($name, sprintf('added it and set %d game(s) to %s', $rows, $theme));
    }

    /**
     * F30 R2, R11. The store stops having a theme.
     *
     * After the step above and never before it: a run that stops in between
     * leaves a database that still works, with the games holding their themes
     * and the store holding a column nobody reads. The other way round would
     * lose the shop's choice.
     */
    private function dropStoreTheme(bool $dryRun): UpgradeStep
    {
        $name = 'the store keeps no theme';
        $shop = $this->shopTable();

        if (!$this->tableExists($shop)) {
            return UpgradeStep::skipped($name, 'there is no store table');
        }

        if (!$this->columnExists($shop, 'theme')) {
            return UpgradeStep::skipped($name);
        }

        if (!$this->columnExists('game', 'theme')) {
            /*
             * A dry run writes nothing, so the step above has not added the
             * column it is waiting for. Reporting a skip here would make the
             * plan undercount by one, and a plan that is wrong about itself
             * is worse than no plan (P02 section 8).
             */
            if ($dryRun) {
                return UpgradeStep::done($name, 'would drop it, after the step above');
            }

            return UpgradeStep::skipped($name, 'no game carries one yet');
        }

        if (!$dryRun) {
            $this->connection->executeStatement('ALTER TABLE '.$shop.' DROP theme');
        }

        return UpgradeStep::done($name, $this->tense($dryRun, 'drop it', 'dropped it'));
    }

    /**
     * @param list<string|null> $candidates
     */
    private function firstNonEmpty(array $candidates): ?string
    {
        foreach ($candidates as $candidate) {
            $trimmed = trim((string) $candidate);

            if ('' !== $trimmed) {
                return $trimmed;
            }
        }

        return null;
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

    /**
     * The database's own word for a column's type — `smallint`, `int` — as
     * INFORMATION_SCHEMA spells it.
     *
     * Read from there rather than from Doctrine's type mapping, because the
     * question this answers is what the table actually is, not what the
     * entity says it should be.
     */
    private function columnTypeOf(string $table, string $column): ?string
    {
        $type = $this->connection->fetchOne(
            'SELECT DATA_TYPE FROM information_schema.COLUMNS '
            .'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column',
            ['table' => $table, 'column' => $column],
        );

        return \is_string($type) ? strtolower($type) : null;
    }

    /** Null when the column is not a character type, or does not exist. */
    private function columnLengthOf(string $table, string $column): ?int
    {
        $length = $this->connection->fetchOne(
            'SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS '
            .'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column',
            ['table' => $table, 'column' => $column],
        );

        return null === $length || false === $length ? null : (int) $length;
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
