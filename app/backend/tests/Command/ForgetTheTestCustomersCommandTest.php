<?php

declare(strict_types=1);

namespace App\Tests\Command;

use App\Entity\Game;
use App\Tests\Support\DatabaseWebTestCase;
use Symfony\Bundle\FrameworkBundle\Console\Application;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Tester\CommandTester;

/**
 * F39 R15–R19: the command that empties the test shop of its customers.
 *
 * What is worth testing here is mostly what it leaves alone. A command that
 * deletes customers is easy to write and easy to write slightly too widely,
 * and the row that should not have gone is the one nobody notices until a
 * wheel stops having prizes on it.
 */
final class ForgetTheTestCustomersCommandTest extends DatabaseWebTestCase
{
    private CommandTester $command;

    protected function setUp(): void
    {
        parent::setUp();

        $this->giveTheGameItsWheel();

        $application = new Application(static::$kernel);
        $this->command = new CommandTester($application->find('app:forget-the-test-customers'));
    }

    /** R15 */
    public function testItDeletesEveryCustomerAndEveryPlay(): void
    {
        $this->givenACustomerWhoPlayed();

        self::assertGreaterThan(0, $this->rowsIn('player'));
        self::assertGreaterThan(0, $this->rowsIn('spin'));

        $this->command->setInputs(['forget']);
        $this->command->execute([]);

        self::assertSame(Command::SUCCESS, $this->command->getStatusCode());
        self::assertSame(0, $this->rowsIn('player'));
        self::assertSame(0, $this->rowsIn('spin'));
    }

    /**
     * R16. The catalogue, the wheel, the sheet and the games are what the
     * shop configured; this is about what customers left behind.
     */
    public function testItLeavesEverythingTheShopConfigured(): void
    {
        $this->givenACustomerWhoPlayed();

        $before = [
            'reward' => $this->rowsIn('reward'),
            'prize' => $this->rowsIn('prize'),
            'game' => $this->rowsIn('game'),
        ];

        self::assertGreaterThan(0, $before['reward']);
        self::assertGreaterThan(0, $before['prize']);

        $this->command->setInputs(['forget']);
        $this->command->execute([]);

        foreach ($before as $table => $rows) {
            self::assertSame($rows, $this->rowsIn($table), sprintf('%s lost rows.', $table));
        }
    }

    /** R17. The word, or nothing happens. */
    public function testItDeletesNothingWithoutTheWord(): void
    {
        $this->givenACustomerWhoPlayed();
        $players = $this->rowsIn('player');

        $this->command->setInputs(['yes']);
        $this->command->execute([]);

        self::assertSame(Command::SUCCESS, $this->command->getStatusCode());
        self::assertSame($players, $this->rowsIn('player'));
        self::assertStringContainsString('Nothing was deleted', $this->command->getDisplay());
    }

    /** R17. And a run nobody is watching can say so. */
    public function testForceSkipsTheQuestion(): void
    {
        $this->givenACustomerWhoPlayed();

        $this->command->execute(['--force' => true]);

        self::assertSame(0, $this->rowsIn('player'));
    }

    /** R17, R18. It counts what it is about to do, and what it did. */
    public function testItSaysWhatItIsAboutToDeleteAndWhatItDeleted(): void
    {
        $this->givenACustomerWhoPlayed();

        $this->command->setInputs(['forget']);
        $this->command->execute([]);

        $display = $this->command->getDisplay();

        self::assertStringContainsString('cannot be undone', $display);
        self::assertStringContainsString('deleted', $display);
        self::assertStringContainsString('left alone', $display);
    }

    /** R19. Twice is somebody making sure, not an error. */
    public function testASecondRunDeletesNothingAndSaysSo(): void
    {
        $this->givenACustomerWhoPlayed();

        $this->command->setInputs(['forget']);
        $this->command->execute([]);

        $this->command->execute([]);

        self::assertSame(Command::SUCCESS, $this->command->getStatusCode());
        self::assertStringContainsString('Nothing to forget', $this->command->getDisplay());
    }

    /**
     * A play is only deletable while it belongs to somebody: `spin.player_id`
     * is ON DELETE SET NULL, so the order inside the command is load-bearing.
     */
    public function testItLeavesNoPlayWithoutACustomer(): void
    {
        $this->givenACustomerWhoPlayed();

        $this->command->execute(['--force' => true]);

        self::assertSame(0, $this->rowsIn('spin'));
    }

    private function givenACustomerWhoPlayed(): void
    {
        $this->identifyAsPlayer();
        $this->client->request('POST', '/api/spin');

        self::assertResponseIsSuccessful('The test could not record a play.');
    }

    private function rowsIn(string $table): int
    {
        return (int) $this->entityManager
            ->getConnection()
            ->fetchOne('SELECT COUNT(*) FROM '.$table);
    }
}
