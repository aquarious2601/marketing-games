<?php

declare(strict_types=1);

namespace App\Command;

use App\Schema\DatabaseUpgrade;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * Brings an existing database up to the current schema (P02 R1).
 *
 * Needed because `doctrine:schema:update` can only describe a difference,
 * and F13's difference cannot be applied without deciding something about
 * every prize already in the table. See P02 section 2.
 */
#[AsCommand(
    name: 'app:upgrade-database',
    description: 'Bring a database that already holds data up to the current schema',
)]
final class UpgradeDatabaseCommand extends Command
{
    public function __construct(private readonly DatabaseUpgrade $upgrade)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption(
            'dry-run',
            null,
            InputOption::VALUE_NONE,
            'Print what would change without writing anything',
        );
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $dryRun = true === $input->getOption('dry-run');

        if ($dryRun) {
            $io->note('Dry run: nothing will be written.');
        }

        try {
            $steps = $this->upgrade->run($dryRun);
        } catch (\Throwable $failure) {
            // The steps that ran before this one have already been committed
            // — MySQL commits DDL implicitly, so there is no all-or-nothing
            // to offer (P02 R5). Saying so is the useful part: running the
            // command again resumes rather than starting over.
            $io->error($failure->getMessage());
            $io->writeln('Anything applied before this point stands. Fix the cause and run the command again.');

            return Command::FAILURE;
        }

        $rows = [];
        $changed = 0;

        foreach ($steps as $step) {
            $rows[] = [$step->changed ? '*' : ' ', $step->name, $step->detail];

            if ($step->changed) {
                ++$changed;
            }
        }

        $io->table(['', 'Step', 'Result'], $rows);

        if (0 === $changed) {
            $io->success('This database is already current. Nothing to do.');

            return Command::SUCCESS;
        }

        if ($dryRun) {
            $io->success(sprintf('%d of %d steps would change something.', $changed, \count($steps)));

            return Command::SUCCESS;
        }

        $io->success(sprintf('%d of %d steps changed something.', $changed, \count($steps)));
        $io->writeln('Check the Rewards tab: any reward the upgrade invented is a free product until you say otherwise.');

        return Command::SUCCESS;
    }
}
