<?php

declare(strict_types=1);

namespace App\Tests\Support;

use App\Entity\Reward;
use App\Entity\User;
use App\Repository\RewardRepository;
use App\Reward\RewardType;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * A functional test with an empty database.
 *
 * Each test starts from nothing rather than from whatever the previous one
 * left behind, so the suite can be read in any order and a failure means what
 * it says.
 */
abstract class DatabaseWebTestCase extends WebTestCase
{
    protected KernelBrowser $client;
    protected EntityManagerInterface $entityManager;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->entityManager = static::getContainer()->get(EntityManagerInterface::class);

        $this->emptyDatabase();
    }

    protected function tearDown(): void
    {
        parent::tearDown();

        // Without this the entity manager stays open between tests and
        // Doctrine's identity map leaks stale objects into the next one.
        $this->entityManager->close();
    }

    private function emptyDatabase(): void
    {
        $connection = $this->entityManager->getConnection();

        // TRUNCATE also resets auto-increment, so ids do not creep upward
        // across the suite and stay small enough to read in a failure.
        $connection->executeStatement('SET FOREIGN_KEY_CHECKS = 0');
        $connection->executeStatement('TRUNCATE TABLE spin');
        $connection->executeStatement('TRUNCATE TABLE player');
        $connection->executeStatement('TRUNCATE TABLE branding');
        $connection->executeStatement('TRUNCATE TABLE `user`');
        $connection->executeStatement('TRUNCATE TABLE prize');
        $connection->executeStatement('TRUNCATE TABLE reward');
        $connection->executeStatement('TRUNCATE TABLE wheel');
        $connection->executeStatement('SET FOREIGN_KEY_CHECKS = 1');

        $this->entityManager->clear();
    }

    /**
     * Creates an admin and signs the client in as them (F07 R17).
     *
     * Every /api/admin route needs a session now, so an admin test that does
     * not call this ends up testing the firewall instead of the feature.
     */
    protected function signInAsAdmin(string $username = 'tester'): User
    {
        $password = 'a-password-long-enough';

        // Reused when it already exists, so a test that signs in twice —
        // once through a helper that sets something up, once for itself —
        // is not a duplicate-username error about nothing it did.
        $user = $this->entityManager->getRepository(User::class)->findOneBy(['username' => $username]);

        if (!$user instanceof User) {
            $user = new User($username);
            $user->setRoles(['ROLE_ADMIN']);
            $user->setPassword(
                static::getContainer()->get(UserPasswordHasherInterface::class)->hashPassword($user, $password),
            );

            $this->entityManager->persist($user);
            $this->entityManager->flush();
        }

        $this->client->request(
            'POST',
            '/api/login',
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(compact('username', 'password'), \JSON_THROW_ON_ERROR),
        );

        self::assertResponseIsSuccessful('The test could not sign in.');

        return $user;
    }

    /**
     * Identifies the client as a player, creating them if need be (F08 R6).
     *
     * `POST /api/spin` refuses an unidentified request now (F08 R16), so a
     * spin test that does not call this ends up testing the guard instead of
     * the feature.
     */
    protected function identifyAsPlayer(string $phone = '0912345678'): void
    {
        $this->post('/api/player/register', [
            'phone' => $phone,
            'firstName' => 'Anh',
            'lastName' => 'Le',
            'birthday' => '1994-03-12',
        ]);

        self::assertResponseIsSuccessful('The test could not identify a player.');
    }

    /**
     * One more spin for a number that has already had one (F20 R1, R11).
     *
     * An identification buys a single spin now, so a fixture that wants
     * several has to identify before each — which is exactly what the person
     * at the stall does: types their number in again. Behind one helper so
     * that "seven spins" in a fixture cannot be read as seven taps of a
     * reload button, which is the thing F20 stops.
     */
    protected function spinOnceMore(string $phone = '0912345678'): void
    {
        $this->post('/api/player/identify', ['phone' => $phone]);
        self::assertResponseIsSuccessful('The test could not identify the player again.');

        $this->client->request('POST', '/api/spin');
        self::assertResponseIsSuccessful('The test could not spin.');
    }

    /**
     * A reward id a wheel payload can point at (F13 R7).
     *
     * Every slice has to say what it gives away now, so a test that saves a
     * wheel needs something in the catalogue. Created once and reused,
     * because what these tests are about is the wheel, not the catalogue —
     * RewardControllerTest covers that.
     */
    protected function aRewardId(string $name = 'Test reward'): int
    {
        return $this->rewardId($name, RewardType::FreeProduct);
    }

    /** A losing reward, for tests that need a slice nobody can claim. */
    protected function aLosingRewardId(string $name = 'Test losing'): int
    {
        return $this->rewardId($name, RewardType::Nothing);
    }

    /** A discount, for the tests about codes (F13 R16). */
    protected function aDiscountRewardId(string $name = 'Test discount', int $percent = 10): int
    {
        return $this->rewardId($name, RewardType::PercentOff, $percent);
    }

    private function rewardId(string $name, RewardType $type, ?int $value = null): int
    {
        $repository = static::getContainer()->get(RewardRepository::class);
        \assert($repository instanceof RewardRepository);

        $reward = $repository->findByName($name);

        if (null === $reward) {
            $reward = new Reward($name, $type, $value);
            $this->entityManager->persist($reward);
            $this->entityManager->flush();
        }

        $id = $reward->getId();
        \assert(null !== $id);

        return $id;
    }

    /**
     * @return array<string, mixed>
     */
    protected function decodeResponse(): array
    {
        $content = $this->client->getResponse()->getContent();
        self::assertIsString($content);

        $decoded = json_decode($content, true, flags: \JSON_THROW_ON_ERROR);
        self::assertIsArray($decoded);

        return $decoded;
    }

    /**
     * @param array<string, mixed> $payload
     */
    protected function put(string $uri, array $payload): void
    {
        $this->client->request(
            'PUT',
            $uri,
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode($payload, \JSON_THROW_ON_ERROR),
        );
    }

    /**
     * @param array<string, mixed>|null $payload
     */
    protected function post(string $uri, ?array $payload = null): void
    {
        $this->client->request(
            'POST',
            $uri,
            server: ['CONTENT_TYPE' => 'application/json'],
            content: null === $payload ? '' : json_encode($payload, \JSON_THROW_ON_ERROR),
        );
    }
}
