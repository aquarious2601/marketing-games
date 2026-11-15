<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Entity\User;
use App\Tests\Support\DatabaseWebTestCase;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * F07: signing in, and what is open to whom.
 *
 * The assertions worth reading twice are the ones about what an
 * unauthenticated caller gets: the whole point of this feature is that the
 * admin stops being reachable, and the whole point of the player routes is
 * that they do not.
 */
final class SecurityControllerTest extends DatabaseWebTestCase
{
    private const USERNAME = 'reviewer';
    private const PASSWORD = 'correct-horse-battery';

    private function createUser(string $username = self::USERNAME, string $password = self::PASSWORD): User
    {
        $user = new User($username);
        $user->setRoles(['ROLE_ADMIN']);
        $user->setPassword(
            static::getContainer()->get(UserPasswordHasherInterface::class)->hashPassword($user, $password),
        );

        $this->entityManager->persist($user);
        $this->entityManager->flush();

        return $user;
    }

    private function logIn(string $username = self::USERNAME, string $password = self::PASSWORD): void
    {
        $this->client->request(
            'POST',
            '/api/login',
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(compact('username', 'password'), \JSON_THROW_ON_ERROR),
        );
    }

    // --------------------------------------------------------- signing in

    /** F07 R10 */
    public function testItSignsInWithTheRightCredentials(): void
    {
        $this->createUser();

        $this->logIn();

        self::assertResponseIsSuccessful();
        self::assertSame(self::USERNAME, $this->decodeResponse()['username']);
    }

    /** F07 R11 — a script on the page must not be able to read the session */
    public function testTheSessionCookieIsHttpOnlyAndSameSite(): void
    {
        $this->createUser();
        $this->logIn();

        $cookies = $this->client->getResponse()->headers->getCookies();
        self::assertNotEmpty($cookies, 'Signing in should set a session cookie.');

        $session = $cookies[0];
        self::assertTrue($session->isHttpOnly(), 'The session cookie must be httpOnly.');
        self::assertNotNull($session->getSameSite(), 'The session cookie must set SameSite.');
    }

    /** F07 R15 */
    public function testItReportsWhoIsSignedIn(): void
    {
        $this->createUser();
        $this->logIn();

        $this->client->request('GET', '/api/me');

        self::assertResponseIsSuccessful();
        self::assertSame(self::USERNAME, $this->decodeResponse()['username']);
    }

    public function testItNeverSendsTheHashOrTheRoles(): void
    {
        $this->createUser();
        $this->logIn();
        $this->client->request('GET', '/api/me');

        $body = (string) $this->client->getResponse()->getContent();

        self::assertStringNotContainsString('password', $body);
        self::assertStringNotContainsString('ROLE_', $body);
        self::assertSame(['id', 'username'], array_keys($this->decodeResponse()));
    }

    /** F07 R15 */
    public function testMeIsUnauthorisedWhenNobodyIsSignedIn(): void
    {
        $this->client->request('GET', '/api/me');

        self::assertResponseStatusCodeSame(Response::HTTP_UNAUTHORIZED);
    }

    /** F07 R14 */
    public function testSigningOutEndsTheSession(): void
    {
        $this->createUser();
        $this->logIn();

        $this->client->request('POST', '/api/logout');
        self::assertResponseStatusCodeSame(Response::HTTP_NO_CONTENT);

        $this->client->request('GET', '/api/me');
        self::assertResponseStatusCodeSame(Response::HTTP_UNAUTHORIZED);
    }

    /** F07 R14 — JSON, not a redirect the SPA would silently follow */
    public function testSigningOutDoesNotRedirect(): void
    {
        $this->createUser();
        $this->logIn();

        $this->client->request('POST', '/api/logout');

        self::assertFalse(
            $this->client->getResponse()->isRedirection(),
            'A redirect would be fetched as the SPA shell and read as success.',
        );
    }

    // ---------------------------------------------------------- rejecting

    /**
     * F07 R12. The response to a wrong password and to a username that does
     * not exist must be indistinguishable, or the login becomes a way to
     * find out who has an account.
     */
    public function testAWrongPasswordAndAnUnknownUserAreIndistinguishable(): void
    {
        $this->createUser();

        $this->logIn(self::USERNAME, 'not-the-right-password');
        $wrongPassword = [
            'status' => $this->client->getResponse()->getStatusCode(),
            'body' => $this->client->getResponse()->getContent(),
        ];

        $this->logIn('nobody-at-all', 'not-the-right-password');
        $unknownUser = [
            'status' => $this->client->getResponse()->getStatusCode(),
            'body' => $this->client->getResponse()->getContent(),
        ];

        self::assertSame($wrongPassword, $unknownUser);
        self::assertSame(Response::HTTP_UNAUTHORIZED, $wrongPassword['status']);
    }

    public function testAFailedLoginLeavesNobodySignedIn(): void
    {
        $this->createUser();

        $this->logIn(self::USERNAME, 'not-the-right-password');

        $this->client->request('GET', '/api/me');
        self::assertResponseStatusCodeSame(Response::HTTP_UNAUTHORIZED);
    }

    public function testAnEmptyPasswordIsRejected(): void
    {
        $this->createUser();

        $this->logIn(self::USERNAME, '');

        self::assertResponseStatusCodeSame(Response::HTTP_UNAUTHORIZED);
    }

    // ----------------------------------------------------- what is closed

    /**
     * F07 R17, R18. The reason this feature exists.
     */
    #[DataProvider('adminRoutes')]
    public function testAdminRoutesAreClosedToStrangers(string $method, string $path): void
    {
        $this->client->request($method, $path);

        self::assertResponseStatusCodeSame(Response::HTTP_UNAUTHORIZED);
        self::assertResponseHeaderSame('Content-Type', 'application/json');
        self::assertArrayHasKey('error', $this->decodeResponse());
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function adminRoutes(): iterable
    {
        yield 'read the wheel' => ['GET', '/api/admin/wheel'];
        yield 'replace the wheel' => ['PUT', '/api/admin/wheel'];
        yield 'read the branding' => ['GET', '/api/admin/branding'];
        yield 'save the branding' => ['PUT', '/api/admin/branding'];
        yield 'upload a logo' => ['POST', '/api/admin/branding/logo'];
        yield 'delete the logo' => ['DELETE', '/api/admin/branding/logo'];
    }

    public function testAnUnauthorisedAdminRequestChangesNothing(): void
    {
        $this->client->request(
            'PUT',
            '/api/admin/wheel',
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode([
                'prizes' => [
                    ['name' => 'Should never be stored', 'probability' => 100, 'rewardId' => $this->aRewardId()],
                    ['name' => 'Nor this', 'probability' => 0, 'rewardId' => $this->aRewardId()],
                ],
            ], \JSON_THROW_ON_ERROR),
        );

        self::assertResponseStatusCodeSame(Response::HTTP_UNAUTHORIZED);
        self::assertSame(0, $this->countRows('wheel'), 'A rejected request must not create a wheel.');
    }

    /** F07 R17 — signed in, the admin works again */
    public function testAdminRoutesOpenOnceSignedIn(): void
    {
        $this->createUser();
        $this->logIn();

        $this->client->request('GET', '/api/admin/wheel');
        self::assertResponseIsSuccessful();

        $this->client->request('GET', '/api/admin/branding');
        self::assertResponseIsSuccessful();
    }

    // ------------------------------------------------------- what is open

    /**
     * F07 R19, R20. The game is for the public; closing these would be the
     * feature breaking the product.
     */
    #[DataProvider('publicRoutes')]
    public function testThePlayerRoutesStayOpen(string $method, string $path): void
    {
        $this->client->request($method, $path);

        self::assertResponseIsSuccessful();
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function publicRoutes(): iterable
    {
        yield 'health' => ['GET', '/api/health'];
        yield 'the wheel' => ['GET', '/api/wheel'];
        // F08: asking who you are cannot require knowing who you are.
        yield 'the identity check' => ['GET', '/api/player/me'];
        yield 'forgetting a player' => ['POST', '/api/player/forget'];
    }

    /**
     * F07 R19 together with F08 R16.
     *
     * The spin is no longer successful without a player, so it has left the
     * list above — but it must still be the *player session* that refuses it
     * and not the admin firewall. A 401 here would mean the game had been
     * closed to the public by accident; a 403 means it is open and merely
     * waiting to be told who is playing.
     */
    public function testASpinIsRefusedByTheGameRatherThanTheFirewall(): void
    {
        $this->client->request('POST', '/api/spin');

        self::assertResponseStatusCodeSame(Response::HTTP_FORBIDDEN);
    }

    /** F07 R19, F08 R16 — identified, with no account anywhere, and it spins */
    public function testAnIdentifiedPlayerSpinsWithoutAnAccount(): void
    {
        $this->identifyAsPlayer();

        $this->client->request('POST', '/api/spin');

        self::assertResponseIsSuccessful();
    }

    /** F07 R20 — a player must see the logo without an account */
    public function testTheLogoIsServedToStrangers(): void
    {
        $this->client->request('GET', '/api/branding/logo');

        // 404 because no logo is set; the point is that it is not a 401.
        self::assertResponseStatusCodeSame(Response::HTTP_NOT_FOUND);
    }

    private function countRows(string $table): int
    {
        return (int) $this->entityManager
            ->getConnection()
            ->fetchOne(sprintf('SELECT COUNT(*) FROM %s', $table));
    }
}
