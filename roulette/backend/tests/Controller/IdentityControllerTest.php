<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Entity\Player;
use App\Entity\Spin;
use App\Tests\Support\DatabaseWebTestCase;
use Symfony\Component\HttpFoundation\Response;

/**
 * F08 through the kernel, the session and the real database.
 */
final class IdentityControllerTest extends DatabaseWebTestCase
{
    private const ME_URI = '/api/player/me';
    private const IDENTIFY_URI = '/api/player/identify';
    private const REGISTER_URI = '/api/player/register';
    private const FORGET_URI = '/api/player/forget';
    private const SPIN_URI = '/api/spin';

    private const PHONE = '0912345678';

    // ------------------------------------------------------ GET /api/player/me

    /**
     * F08 R12, and the decision in F08 section 8: not knowing who the visitor
     * is, is this endpoint's normal state. A 401 would reach the SPA's API
     * client as "your session has gone" and show the admin a login prompt.
     */
    public function testItReportsNobodyWithATwoHundredRatherThanAFourOhOne(): void
    {
        $this->client->request('GET', self::ME_URI);

        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('Content-Type', 'application/json');
        self::assertNull($this->decodeResponse()['player']);
    }

    /** F08 R13 */
    public function testItReportsTheIdentifiedPlayerOnALaterRequest(): void
    {
        $this->register();

        $this->client->request('GET', self::ME_URI);

        self::assertResponseIsSuccessful();
        self::assertSame('Anh', $this->decodeResponse()['player']['firstName']);
    }

    /**
     * F08 R11. The last name and the birthday are collected and stored, and
     * must never travel back to a page a player can open.
     */
    public function testThePlayerPageIsNeverToldTheLastNameOrTheBirthday(): void
    {
        $this->register();

        foreach ([self::ME_URI, self::IDENTIFY_URI] as $uri) {
            if (self::IDENTIFY_URI === $uri) {
                $this->post($uri, ['phone' => self::PHONE]);
            } else {
                $this->client->request('GET', $uri);
            }

            $body = (string) $this->client->getResponse()->getContent();

            self::assertStringNotContainsString('Le', $body, $uri.' leaked the last name.');
            self::assertStringNotContainsString('1994', $body, $uri.' leaked the birthday.');
            self::assertStringNotContainsString('lastName', $body);
            self::assertStringNotContainsString('birthday', $body);
        }
    }

    /** F08 R15 */
    public function testASessionNamingADeletedPlayerIsTreatedAsUnidentified(): void
    {
        $this->register();

        $player = $this->entityManager->getRepository(Player::class)->findOneBy([]);
        self::assertInstanceOf(Player::class, $player);
        $this->entityManager->remove($player);
        $this->entityManager->flush();

        $this->client->request('GET', self::ME_URI);

        self::assertResponseIsSuccessful();
        self::assertNull($this->decodeResponse()['player']);

        // And the spin is refused rather than failing on a missing row.
        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseStatusCodeSame(Response::HTTP_FORBIDDEN);
    }

    // ------------------------------------------------ POST /api/player/identify

    /** F08 R5 — a number we have never seen stores nothing */
    public function testAnUnknownNumberIsReportedAsUnknownAndStoresNothing(): void
    {
        $this->post(self::IDENTIFY_URI, ['phone' => self::PHONE]);

        self::assertResponseIsSuccessful();

        $body = $this->decodeResponse();

        self::assertFalse($body['known']);
        self::assertSame(self::PHONE, $body['phone']);
        self::assertArrayHasKey('player', $body, 'The page must read one shape either way.');
        self::assertNull($body['player']);

        self::assertSame(0, $this->countRows('player'));
    }

    /** F08 R5 — and it does not identify anybody */
    public function testAnUnknownNumberDoesNotIdentifyAnybody(): void
    {
        $this->post(self::IDENTIFY_URI, ['phone' => self::PHONE]);

        $this->client->request('POST', self::SPIN_URI);

        self::assertResponseStatusCodeSame(Response::HTTP_FORBIDDEN);
        self::assertSame(0, $this->countRows('spin'));
    }

    /** F08 R5 */
    public function testAKnownNumberIsIdentifiedImmediately(): void
    {
        $this->register();
        $this->post(self::FORGET_URI);

        $this->post(self::IDENTIFY_URI, ['phone' => self::PHONE]);

        self::assertResponseIsSuccessful();
        self::assertTrue($this->decodeResponse()['known']);
        self::assertSame('Anh', $this->decodeResponse()['player']['firstName']);

        // Identified means identified: the spin works with no further step.
        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();
    }

    /**
     * F08 R3, R9. The whole point of the canonical form: two spellings of one
     * number are one player, so a returning player is recognised however they
     * type it this time.
     */
    public function testADifferentSpellingOfAStoredNumberFindsTheSamePlayer(): void
    {
        $this->register();

        $this->post(self::IDENTIFY_URI, ['phone' => '(091) 234-5678']);

        self::assertResponseIsSuccessful();
        self::assertTrue($this->decodeResponse()['known']);
        self::assertSame(1, $this->countRows('player'));
    }

    /** F08 R4 */
    public function testItRejectsANumberThatIsTooShortAndStoresNothing(): void
    {
        $this->post(self::IDENTIFY_URI, ['phone' => '123']);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame(
            'phone',
            $this->decodeResponse()['error']['violations'][0]['field'],
        );
        self::assertSame(0, $this->countRows('player'));
    }

    public function testItRejectsAMissingNumber(): void
    {
        $this->post(self::IDENTIFY_URI, []);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
    }

    /**
     * A JSON number has already eaten the leading zero, which is the most
     * load-bearing digit in a national number, so it is rejected rather than
     * cast into a different person's number.
     */
    public function testItRejectsANumberSentAsAJsonNumber(): void
    {
        $this->post(self::IDENTIFY_URI, ['phone' => 912345678]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
    }

    public function testItRejectsABodyThatIsNotJson(): void
    {
        $this->client->request(
            'POST',
            self::IDENTIFY_URI,
            server: ['CONTENT_TYPE' => 'application/json'],
            content: '{not json',
        );

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
    }

    // ------------------------------------------------ POST /api/player/register

    /** F08 R6, R8 */
    public function testItCreatesAPlayerAndIdentifiesThem(): void
    {
        $this->register();

        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);
        self::assertSame('Anh', $this->decodeResponse()['player']['firstName']);

        self::assertSame(1, $this->countRows('player'));

        $player = $this->entityManager->getRepository(Player::class)->findOneBy([]);
        self::assertInstanceOf(Player::class, $player);

        self::assertSame(self::PHONE, $player->getPhone());
        self::assertSame('Anh', $player->getFirstName());
        self::assertSame('Le', $player->getLastName());
        self::assertSame('1994-03-12', $player->getBirthday()->format('Y-m-d'));
    }

    /** F08 R3 — what is stored is the canonical form, never what was typed */
    public function testItStoresTheCanonicalNumberRatherThanWhatWasTyped(): void
    {
        $this->register(['phone' => '  (091) 234.5678 ']);

        $player = $this->entityManager->getRepository(Player::class)->findOneBy([]);
        self::assertInstanceOf(Player::class, $player);

        self::assertSame(self::PHONE, $player->getPhone());
    }

    /** F08 R10 — names are trimmed */
    public function testItTrimsTheNames(): void
    {
        $this->register(['firstName' => '  Anh  ', 'lastName' => "\tLe\n"]);

        $player = $this->entityManager->getRepository(Player::class)->findOneBy([]);
        self::assertInstanceOf(Player::class, $player);

        self::assertSame('Anh', $player->getFirstName());
        self::assertSame('Le', $player->getLastName());
    }

    /** F08 R10 — counted in characters, so a Vietnamese name is not nine bytes over */
    public function testItAcceptsAnAccentedNameUpToTheCharacterLimit(): void
    {
        $this->register(['lastName' => str_repeat('ễ', Player::NAME_MAX_LENGTH)]);

        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);
    }

    /**
     * F08 R7. Two devices at one stall submitting the same number is an
     * ordinary Saturday, and the second one must be let in rather than shown
     * an error about a number that is demonstrably theirs.
     */
    public function testRegisteringANumberThatAlreadyExistsIdentifiesThatPlayer(): void
    {
        $this->register();
        $this->post(self::FORGET_URI);

        $this->register(['firstName' => 'Someone', 'lastName' => 'Else', 'birthday' => '2000-01-01']);

        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);
        self::assertSame(1, $this->countRows('player'), 'A second row would split one person in two.');

        // F08 R7: the stored details are not overwritten by the second
        // submission. Somebody retyping a number must not rename its owner.
        $player = $this->entityManager->getRepository(Player::class)->findOneBy([]);
        self::assertInstanceOf(Player::class, $player);
        self::assertSame('Anh', $player->getFirstName());

        // And the second submission is identified as the original player.
        self::assertSame('Anh', $this->decodeResponse()['player']['firstName']);
    }

    /** F08 R10 */
    public function testItCollectsEveryProblemInOnePass(): void
    {
        $this->post(self::REGISTER_URI, [
            'phone' => '12',
            'firstName' => '  ',
            'lastName' => str_repeat('x', Player::NAME_MAX_LENGTH + 1),
            'birthday' => 'not a date',
        ]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);

        $fields = array_column($this->decodeResponse()['error']['violations'], 'field');

        self::assertSame(['phone', 'firstName', 'lastName', 'birthday'], $fields);
        self::assertSame(0, $this->countRows('player'));
    }

    /**
     * F08 R10.
     *
     * @param string|int $birthday
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('unusableBirthdays')]
    public function testItRejectsABirthdayThatIsNotOne(mixed $birthday): void
    {
        $this->register(['birthday' => $birthday]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame(
            'birthday',
            $this->decodeResponse()['error']['violations'][0]['field'],
        );
        self::assertSame(0, $this->countRows('player'));
    }

    /**
     * @return iterable<string, array{mixed}>
     */
    public static function unusableBirthdays(): iterable
    {
        yield 'empty' => [''];
        yield 'prose' => ['sometime in the nineties'];
        yield 'the wrong way round' => ['12/03/1994'];
        yield 'a datetime' => ['1994-03-12T00:00:00+00:00'];
        // PHP happily rolls this into 2 March. The parsed date is compared
        // back against the input so it cannot.
        yield 'a day that does not exist' => ['1994-02-30'];
        yield 'the future' => ['2099-01-01'];
        yield 'before records' => ['1823-04-01'];
        yield 'not a string' => [19940312];
    }

    /** F08 R10 — the boundary is today, not yesterday */
    public function testItAcceptsABirthdayOfToday(): void
    {
        $this->register([
            'birthday' => (new \DateTimeImmutable('today', new \DateTimeZone('UTC')))->format('Y-m-d'),
        ]);

        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);
    }

    // ------------------------------------------------- POST /api/player/forget

    /** F08 R14 */
    public function testForgettingReturnsTheVisitorToBeingNobody(): void
    {
        $this->register();

        $this->post(self::FORGET_URI);
        self::assertResponseStatusCodeSame(Response::HTTP_NO_CONTENT);

        $this->client->request('GET', self::ME_URI);
        self::assertNull($this->decodeResponse()['player']);

        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseStatusCodeSame(Response::HTTP_FORBIDDEN);
    }

    /** F08 R14 — the player row survives; only the session is cleared */
    public function testForgettingDoesNotDeleteThePlayer(): void
    {
        $this->register();

        $this->post(self::FORGET_URI);

        self::assertSame(1, $this->countRows('player'));
    }

    public function testForgettingNobodyIsStillFine(): void
    {
        $this->post(self::FORGET_URI);

        self::assertResponseStatusCodeSame(Response::HTTP_NO_CONTENT);
    }

    // ---------------------------------------------------------- POST /api/spin

    /**
     * F08 R16. Both halves matter. A refusal that still drew a prize would be
     * invisible to a test that only read the status code, and would consume
     * stock the moment prizes have limits.
     */
    public function testAnUnidentifiedSpinIsRefusedAndRecordsNothing(): void
    {
        $this->client->request('POST', self::SPIN_URI);

        self::assertResponseStatusCodeSame(Response::HTTP_FORBIDDEN);
        self::assertResponseHeaderSame('Content-Type', 'application/json');
        self::assertStringContainsString(
            'who you are',
            $this->decodeResponse()['error']['message'],
        );

        self::assertSame(0, $this->countRows('spin'));
    }

    /** F08 R16 — and it does not create a wheel as a side effect either */
    public function testARefusedSpinDoesNotCreateTheDefaultWheel(): void
    {
        $this->client->request('POST', self::SPIN_URI);

        self::assertSame(0, $this->countRows('wheel'));
    }

    /** F08 R17 */
    public function testASpinRecordsWhoSpunIt(): void
    {
        $this->register();

        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();

        $spin = $this->entityManager->getRepository(Spin::class)->findOneBy([]);
        self::assertInstanceOf(Spin::class, $spin);

        self::assertNotNull($spin->getPlayer(), 'The spin has no player against it.');
        self::assertSame(self::PHONE, $spin->getPlayer()?->getPhone());
    }

    /** F08 R18 — identification is not a limit */
    public function testAnIdentifiedPlayerMaySpinRepeatedly(): void
    {
        $this->register();

        for ($i = 0; $i < 3; ++$i) {
            $this->client->request('POST', self::SPIN_URI);
            self::assertResponseIsSuccessful();
        }

        self::assertSame(3, $this->countRows('spin'));

        $spins = $this->entityManager->getRepository(Spin::class)->findBy([]);
        foreach ($spins as $spin) {
            self::assertSame(self::PHONE, $spin->getPlayer()?->getPhone());
        }
    }

    /**
     * F08 R19, R25. The opposite decision from the prize snapshot in F02 R10,
     * for the opposite reason: a person's name must not survive the person,
     * or "delete my data" would be a lie.
     */
    public function testDeletingAPlayerLeavesTheirSpinsCountedButAnonymous(): void
    {
        $this->register();
        $this->client->request('POST', self::SPIN_URI);
        $won = $this->decodeResponse()['prize']['name'];

        $player = $this->entityManager->getRepository(Player::class)->findOneBy([]);
        self::assertInstanceOf(Player::class, $player);
        $this->entityManager->remove($player);
        $this->entityManager->flush();
        $this->entityManager->clear();

        self::assertSame(1, $this->countRows('spin'), 'Deleting a player took the spin with it.');

        $spin = $this->entityManager->getRepository(Spin::class)->findOneBy([]);
        self::assertInstanceOf(Spin::class, $spin);

        self::assertSame($won, $spin->getPrizeName(), 'The prize snapshot must survive.');
        self::assertNull($spin->getPlayer(), 'The player link must not.');
    }

    /** F08 R2 — the spin response is unchanged; identifying leaks nothing new */
    public function testTheSpinResponseStillCarriesNothingButThePrize(): void
    {
        $this->register();

        $this->client->request('POST', self::SPIN_URI);

        self::assertSame(['prize', 'spunAt'], array_keys($this->decodeResponse()));
        self::assertStringNotContainsString(
            'phone',
            (string) $this->client->getResponse()->getContent(),
        );
    }

    /**
     * @param array<string, mixed> $overrides
     */
    private function register(array $overrides = []): void
    {
        $this->post(self::REGISTER_URI, [
            'phone' => self::PHONE,
            'firstName' => 'Anh',
            'lastName' => 'Le',
            'birthday' => '1994-03-12',
            ...$overrides,
        ]);
    }

    private function countRows(string $table): int
    {
        return (int) $this->entityManager
            ->getConnection()
            ->fetchOne(sprintf('SELECT COUNT(*) FROM %s', $table));
    }
}
