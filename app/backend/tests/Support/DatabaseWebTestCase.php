<?php

declare(strict_types=1);

namespace App\Tests\Support;

use App\Branding\BackgroundStore;
use App\Branding\Theme;
use App\Entity\Game;
use App\Entity\Reward;
use App\Entity\Store;
use App\Game\GameType;
use App\Games\Wheel\WheelProvider;
use App\Entity\User;
use App\Repository\RewardRepository;
use App\Reward\RewardType;
use App\Tests\Support\FakeImage;
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

    /**
     * The store and the one live game every test starts with (F27 R26, R32).
     *
     * Seeded here rather than per test because it is what an upgraded
     * installation looks like: one shop, one live wheel, reachable at `/`.
     * A test that wants a second game, or none, says so itself.
     */
    protected Store $store;
    protected Game $game;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->entityManager = static::getContainer()->get(EntityManagerInterface::class);

        $this->emptyDatabase();
        $this->seedTheStore();
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
        $connection->executeStatement('TRUNCATE TABLE store');
        $connection->executeStatement('TRUNCATE TABLE game');
        $connection->executeStatement('TRUNCATE TABLE `user`');
        $connection->executeStatement('TRUNCATE TABLE prize');
        $connection->executeStatement('TRUNCATE TABLE gift');
        $connection->executeStatement('TRUNCATE TABLE reward');
        $connection->executeStatement('TRUNCATE TABLE wheel');
        $connection->executeStatement('SET FOREIGN_KEY_CHECKS = 1');

        $this->entityManager->clear();
    }

    /**
     * One shop with one live wheel game, which is what the upgrade leaves
     * and therefore what every test should be able to assume.
     */
    private function seedTheStore(): void
    {
        $this->store = new Store();
        $this->entityManager->persist($this->store);

        $this->game = new Game($this->store, 'Test campaign', GameType::Wheel);
        $this->game->setLive(true);
        $this->entityManager->persist($this->game);

        $this->entityManager->flush();

    }

    /**
     * Gives the seeded game the default wheel (F01 R2), which also seeds the
     * six default rewards.
     *
     * Opt-in rather than part of the fixture: a live game with no wheel is
     * not what an upgraded installation looks like (F27 R43 refuses to turn
     * one live), but most tests want an empty catalogue and the provider
     * fills it.
     */
    protected function giveTheGameItsWheel(): void
    {
        $wheels = static::getContainer()->get(WheelProvider::class);
        \assert($wheels instanceof WheelProvider);

        $wheels->getOrCreate($this->game);
        $this->entityManager->flush();
    }

    /**
     * F35. Puts the seeded game on the custom theme with a picture really on
     * disk, and hands back the path so a test can take it away again.
     *
     * Written here rather than through the upload endpoint because the tests
     * that want it are about what the player's page is told and what the
     * public route serves, not about uploading — and an upload needs an
     * admin session those tests have no other reason to have.
     */
    protected function giveTheGameAPicture(Theme $base = Theme::Birthday, string $filename = 'f35-test.png'): string
    {
        $backgrounds = static::getContainer()->get(BackgroundStore::class);
        \assert($backgrounds instanceof BackgroundStore);

        $path = $backgrounds->pathFor($filename);

        if (!is_dir(\dirname($path))) {
            mkdir(\dirname($path), 0o775, true);
        }

        file_put_contents($path, FakeImage::png(1600, 900));

        $this->game->setTheme(Theme::Custom);
        $this->game->setThemeBase($base);
        $this->game->setBackground($filename);
        $this->entityManager->flush();

        return $path;
    }

    /** The admin path for this game's prize list (F27 R40). */
    protected function wheelUri(?Game $game = null): string
    {
        return '/api/admin/games/'.($game ?? $this->game)->getId().'/wheel';
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
            'birthDay' => 12,
            'birthMonth' => 3,
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
     * A wheel on which every slice is claimable.
     *
     * The default wheel has a losing slice, so a test that needs spins to
     * *win* cannot use it: the draw is real and roughly one spin in five
     * would land on nothing. Since F31 R23 the log lists wins only, which
     * turned that into a flapping count rather than a missing row.
     *
     * Assumes the caller is signed in as an admin, because saving a wheel
     * needs a session (F07 R17).
     */
    protected function givenAWheelThatAlwaysWins(): void
    {
        $this->put($this->wheelUri(), [
            'prizes' => [
                ['name' => 'Free coffee', 'probability' => 50, 'rewardId' => $this->aRewardId()],
                ['name' => 'Free cake', 'probability' => 50, 'rewardId' => $this->aRewardId('Cake')],
            ],
        ]);
        self::assertResponseIsSuccessful('The test could not set up a winning wheel.');
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
