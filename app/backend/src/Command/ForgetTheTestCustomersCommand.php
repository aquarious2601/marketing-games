<?php

declare(strict_types=1);

namespace App\Command;

use Doctrine\DBAL\Connection;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Question\Question;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * Deletes every customer and every play (F39 R15–R19).
 *
 * F39 made both codes digits, and every code issued before it was made from
 * letters. Supporting two vintages at a counter means a scanner that reads
 * some customers' cards and not others, with nothing on screen to say which
 * — so while the shop is still in test, the codes of the old vintage are
 * deleted rather than carried.
 *
 * What it does **not** touch is as deliberate as what it does: the reward
 * catalogue, the prizes on a wheel, the gifts on a sheet and the games are
 * what the shop configured, and this is about what customers left behind.
 *
 * Written as a command rather than run as a statement because deleting
 * somebody's data should be a thing with a name, a confirmation and a
 * record of what it did — and because the shop will want it again before
 * they open.
 */
#[AsCommand(
    name: 'app:forget-the-test-customers',
    description: 'Delete every customer and every play, keeping the catalogue and the games',
)]
final class ForgetTheTestCustomersCommand extends Command
{
    /** What it is deleting, in the order it must go. */
    private const TABLES = ['spin', 'player'];

    /** The word, so a fat-fingered `y` cannot empty a table. */
    private const CONFIRMATION = 'forget';

    public function __construct(private readonly Connection $connection)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption(
            'force',
            null,
            InputOption::VALUE_NONE,
            'Delete without asking, for a run nobody is watching',
        );
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $counts = $this->counts();
        $total = array_sum($counts);

        if (0 === $total) {
            // R19. Running it twice is not an error; it is somebody making
            // sure.
            $io->success('There are no customers and no plays. Nothing to forget.');

            return Command::SUCCESS;
        }

        $io->section('About to delete');
        $io->listing(array_map(
            static fn (string $table): string => sprintf('%s: %d row(s)', $table, $counts[$table]),
            array_keys($counts),
        ));
        $io->text('The reward catalogue, the wheels, the gift sheets and the games are left alone.');
        $io->warning('This cannot be undone.');

        if (!$input->getOption('force') && !$this->confirmed($io)) {
            $io->text('Nothing was deleted.');

            return Command::SUCCESS;
        }

        $deleted = $this->delete();

        foreach ($deleted as $table => $rows) {
            $io->text(sprintf('%s: deleted %d row(s)', $table, $rows));
        }

        $io->success('The customers and their plays are gone.');

        return Command::SUCCESS;
    }

    private function confirmed(SymfonyStyle $io): bool
    {
        $question = new Question(sprintf('Type "%s" to go ahead: ', self::CONFIRMATION));

        return self::CONFIRMATION === trim((string) $io->askQuestion($question));
    }

    /** @return array<string, int> */
    private function counts(): array
    {
        $counts = [];

        foreach (self::TABLES as $table) {
            $counts[$table] = (int) $this->connection->fetchOne('SELECT COUNT(*) FROM '.$table);
        }

        return $counts;
    }

    /**
     * Spins first, then players.
     *
     * `spin.player_id` is ON DELETE SET NULL, so deleting players first
     * would leave every play in place with nobody attached to it — rows that
     * are no longer anybody's and no longer deletable by this command.
     *
     * @return array<string, int>
     */
    private function delete(): array
    {
        $deleted = [];

        foreach (self::TABLES as $table) {
            $deleted[$table] = (int) $this->connection->executeStatement('DELETE FROM '.$table);
        }

        return $deleted;
    }
}
