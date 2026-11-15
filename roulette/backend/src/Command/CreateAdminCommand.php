<?php

declare(strict_types=1);

namespace App\Command;

use App\Entity\User;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Question\Question;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * Creates an admin account (F07 R5, R6).
 *
 * The only way the first account can come into existence. A first-run setup
 * page was the alternative and hands the admin to whoever reaches the URL
 * first; environment variables were the other and put the password in a file
 * and in shell history. Requiring server access is the point.
 */
#[AsCommand(
    name: 'app:create-admin',
    description: 'Create an admin user who can configure the game',
)]
final class CreateAdminCommand extends Command
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly UserPasswordHasherInterface $hasher,
        private readonly EntityManagerInterface $entityManager,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('username', InputArgument::OPTIONAL, 'The username to create');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $username = $input->getArgument('username');

        if (!\is_string($username) || '' === trim($username)) {
            $username = (string) $io->ask('Username');
        }

        $username = trim($username);

        $problem = $this->checkUsername($username);

        if (null !== $problem) {
            $io->error($problem);

            return Command::FAILURE;
        }

        $password = $this->askForPassword($io);

        if (null === $password) {
            return Command::FAILURE;
        }

        $user = new User($username);
        $user->setPassword($this->hasher->hashPassword($user, $password));
        $user->setRoles(['ROLE_ADMIN']);

        $this->entityManager->persist($user);
        $this->entityManager->flush();

        $io->success(sprintf('Created "%s". They can now sign in at /login.', $username));

        return Command::SUCCESS;
    }

    private function checkUsername(string $username): ?string
    {
        $length = mb_strlen($username);

        if ($length < User::USERNAME_MIN_LENGTH || $length > User::USERNAME_MAX_LENGTH) {
            return sprintf(
                'A username must be between %d and %d characters.',
                User::USERNAME_MIN_LENGTH,
                User::USERNAME_MAX_LENGTH,
            );
        }

        // F07 R6
        if (null !== $this->users->findByUsername($username)) {
            return sprintf('"%s" already exists.', $username);
        }

        return null;
    }

    private function askForPassword(SymfonyStyle $io): ?string
    {
        $password = (string) $io->askQuestion($this->passwordQuestion('Password'));

        if (mb_strlen($password) < User::PASSWORD_MIN_LENGTH) {
            $io->error(sprintf('A password must be at least %d characters.', User::PASSWORD_MIN_LENGTH));

            return null;
        }

        $confirm = (string) $io->askQuestion($this->passwordQuestion('Repeat it'));

        if ($password !== $confirm) {
            $io->error('Those did not match.');

            return null;
        }

        return $password;
    }

    /**
     * F07 R6: typing a password must not leave it on the screen.
     *
     * Hidden input needs a real terminal. When there is not one — input
     * piped in by a deployment script, or by a test — asking for hidden
     * input reads nothing at all and the command appears to reject a
     * perfectly good password. There is also no screen to hide it from in
     * that case, so a plain read is both the only thing that works and no
     * less safe.
     */
    private function passwordQuestion(string $prompt): Question
    {
        $question = new Question($prompt);

        if (\function_exists('stream_isatty') && @stream_isatty(\STDIN)) {
            $question->setHidden(true);
            $question->setHiddenFallback(false);
        }

        return $question;
    }
}
