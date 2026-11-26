<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Entity\Player;
use App\Player\CustomerCode;
use App\Entity\Spin;
use App\Tests\Support\DatabaseWebTestCase;
use PHPUnit\Framework\Attributes\DataProvider;
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

    /** The number from F19's report, as its owner dials it. */
    private const FRENCH_PHONE = '0614856240';

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

            // The field names are a fact about the envelope, so they are
            // still read straight off it.
            self::assertStringNotContainsString('lastName', $body);
            self::assertStringNotContainsString('birthday', $body);

            /*
             * The values are read decoded, not searched for in the raw
             * body. Searching the body was the same test until a key named
             * `spinsLeft` arrived (F23 R12) and the surname "Le" was found
             * inside it — at which point a test of what leaks had quietly
             * become a test of how the keys are spelled. Values are what
             * F08 R11 is about.
             */
            foreach (self::valuesIn($this->decodeResponse()) as $path => $value) {
                self::assertStringNotContainsString(
                    'Le',
                    $value,
                    $uri.' leaked the last name at '.$path.'.',
                );
                self::assertStringNotContainsString(
                    '1994',
                    $value,
                    $uri.' leaked the birthday at '.$path.'.',
                );
            }
        }
    }

    /**
     * Every scalar in a decoded response, keyed by where it was found, so a
     * failure names the field rather than making somebody look for it.
     *
     * @param array<mixed> $payload
     *
     * @return array<string, string>
     */
    private static function valuesIn(array $payload, string $prefix = ''): array
    {
        $values = [];

        /** @var mixed $value */
        foreach ($payload as $key => $value) {
            $path = '' === $prefix ? (string) $key : $prefix.'.'.$key;

            if (\is_array($value)) {
                $values += self::valuesIn($value, $path);

                continue;
            }

            $values[$path] = \is_scalar($value) ? (string) $value : '';
        }

        return $values;
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

    /**
     * F19 R6, R7, R9. The report this feature answers: on a French campaign
     * every way of writing one number finds the one player.
     *
     * Through the kernel rather than only against PhoneMatch, because the
     * thing that was broken was a lookup, not a comparison.
     */
    #[DataProvider('otherSpellingsOfTheFrenchNumber')]
    public function testAFrenchNumberIsOnePlayerHoweverItIsWritten(string $typed): void
    {
        $this->register(['phone' => self::FRENCH_PHONE]);
        $this->post(self::FORGET_URI);

        $this->post(self::IDENTIFY_URI, ['phone' => $typed]);

        self::assertResponseIsSuccessful();
        self::assertTrue($this->decodeResponse()['known'], $typed.' was not recognised.');
        self::assertSame(1, $this->countRows('player'));
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function otherSpellingsOfTheFrenchNumber(): iterable
    {
        yield 'international' => ['+33614856240'];
        yield 'international the long way' => ['0033614856240'];
        yield 'without the trunk zero' => ['614856240'];
        yield 'pasted, code but no plus' => ['33614856240'];
        yield 'spaced the way it is written' => ['+33 6 14 85 62 40'];
    }

    /**
     * F19 R11. The page is shown the number on the row, not the one just
     * typed, so "Not you?" names the identity the system is actually
     * holding.
     */
    public function testThePageIsShownTheStoredSpellingNotTheTypedOne(): void
    {
        $this->register(['phone' => self::FRENCH_PHONE]);
        $this->post(self::FORGET_URI);

        $this->post(self::IDENTIFY_URI, ['phone' => '+33614856240']);

        self::assertSame(self::FRENCH_PHONE, $this->decodeResponse()['player']['phone']);
    }

    /**
     * F19 R10, which is F08 R7 unchanged: retyping a number in another
     * spelling reaches the player who holds it, and does not rename them.
     */
    public function testRegisteringAnotherSpellingAddsNoRowAndRenamesNobody(): void
    {
        $this->register(['phone' => self::FRENCH_PHONE]);

        $this->post(self::REGISTER_URI, [
            'phone' => '+33614856240',
            'firstName' => 'Somebody',
            'lastName' => 'Else',
            'birthDay' => 1,
            'birthMonth' => 1,
        ]);

        self::assertResponseIsSuccessful();
        self::assertSame(1, $this->countRows('player'));
        self::assertSame('Anh', $this->decodeResponse()['player']['firstName']);
    }

    /**
     * F19 R8, and the half of this feature that is easy to get wrong. `06`
     * and `07` are both French mobile prefixes, so these are two people who
     * share the last nine digits of their number.
     */
    public function testTwoFrenchMobilePrefixesAreTwoPlayers(): void
    {
        $this->register(['phone' => self::FRENCH_PHONE]);
        $this->post(self::FORGET_URI);

        $this->post(self::IDENTIFY_URI, ['phone' => '0714856240']);

        self::assertFalse($this->decodeResponse()['known'], 'Somebody else was identified.');

        $this->register(['phone' => '0714856240', 'firstName' => 'Claire']);

        self::assertSame(2, $this->countRows('player'));
    }

    /**
     * F19 R9. The reason any of this matters: a returning player's history
     * stays in one place however they typed their number that day.
     */
    public function testSpinsFromBothSpellingsLandOnOnePlayer(): void
    {
        $this->register(['phone' => self::FRENCH_PHONE]);
        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();

        $this->post(self::FORGET_URI);
        $this->post(self::IDENTIFY_URI, ['phone' => '+33614856240']);
        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();

        self::assertSame(1, $this->countRows('player'));
        self::assertSame(2, $this->countRows('spin'));

        $spins = $this->entityManager->getRepository(Spin::class)->findBy([]);
        foreach ($spins as $spin) {
            self::assertSame(self::FRENCH_PHONE, $spin->getPlayer()?->getPhone());
        }
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
        // F38 R1: the day and the month, and no year to assert.
        self::assertSame(12, $player->getBirthDay());
        self::assertSame(3, $player->getBirthMonth());
    }

    /** F34 R1, R7, R9. A customer being created is given their card. */
    public function testItGivesANewCustomerTheirCard(): void
    {
        $this->register();

        $card = $this->decodeResponse()['card'];

        self::assertIsString($card);
        self::assertMatchesRegularExpression(CustomerCode::pattern(), $card);

        $player = $this->entityManager->getRepository(Player::class)->findOneBy([]);
        self::assertInstanceOf(Player::class, $player);
        self::assertSame($player->getCode(), $card, 'The card shown is not the one stored.');
    }

    /**
     * F34 R8, R9. The card belongs to the customer, and anybody may type
     * anybody's number into a stall phone — so a request that found an
     * existing customer is told nothing about their card.
     */
    public function testItDoesNotHandOverTheCardOfACustomerWhoAlreadyExisted(): void
    {
        $this->register();
        $this->post(self::FORGET_URI);

        $this->register(['firstName' => 'Someone', 'lastName' => 'Else', 'birthDay' => 1, 'birthMonth' => 1]);

        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);
        self::assertNull($this->decodeResponse()['card']);
    }

    /** F34 R6. The photograph taken in January still works in June. */
    public function testItNeverReissuesACard(): void
    {
        $this->register();

        $player = $this->entityManager->getRepository(Player::class)->findOneBy([]);
        self::assertInstanceOf(Player::class, $player);
        $issued = $player->getCode();

        $this->post(self::FORGET_URI);
        $this->register();

        $this->entityManager->clear();
        $again = $this->entityManager->getRepository(Player::class)->findOneBy([]);
        self::assertInstanceOf(Player::class, $again);

        self::assertSame($issued, $again->getCode());
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

        $this->register(['firstName' => 'Someone', 'lastName' => 'Else', 'birthDay' => 1, 'birthMonth' => 1]);

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
            'birthDay' => 'not a day',
        ]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);

        $fields = array_column($this->decodeResponse()['error']['violations'], 'field');

        self::assertSame(['phone', 'firstName', 'lastName', 'birthday'], $fields);
        self::assertSame(0, $this->countRows('player'));
    }

    /**
     * F08 R10, F38 R3, R4.
     *
     * @param mixed $day
     * @param mixed $month
     */
    #[DataProvider('unusableBirthdays')]
    public function testItRejectsABirthdayThatIsNotOne(mixed $day, mixed $month): void
    {
        $this->register(['birthDay' => $day, 'birthMonth' => $month]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame(
            'birthday',
            $this->decodeResponse()['error']['violations'][0]['field'],
        );
        self::assertSame(0, $this->countRows('player'));
    }

    /**
     * @return iterable<string, array{mixed, mixed}>
     */
    public static function unusableBirthdays(): iterable
    {
        yield 'nothing at all' => [null, null];
        yield 'no month' => [12, null];
        yield 'no day' => [null, 3];
        yield 'empty' => ['', ''];
        yield 'prose' => ['the twelfth', 'March'];
        yield 'a day too far' => [32, 3];
        yield 'a month too far' => [12, 13];
        yield 'day zero' => [0, 3];
        yield 'month zero' => [12, 0];
        // F38 R3. February has no 31st; PHP would roll it into March.
        yield 'a day that does not exist' => [31, 2];
        yield 'nor does the 31st of April' => [31, 4];
    }

    /**
     * F38 R3. It exists once every four years, and the people born on it
     * have a birthday every one of them.
     */
    public function testItAcceptsTheTwentyNinthOfFebruary(): void
    {
        $this->register(['birthDay' => 29, 'birthMonth' => 2]);

        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);
    }

    /** F38 R1. A year sent by some other client is not stored. */
    public function testItKeepsNoYearForSomebodyRegisteringNow(): void
    {
        $this->register(['birthDay' => 12, 'birthMonth' => 3, 'birthday' => '1994-03-12']);

        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);
        self::assertNull(
            $this->entityManager->getConnection()->fetchOne('SELECT birthday FROM player'),
        );
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

    /**
     * F08 R18 as F20 R11 amended it: identification is not a limit on a
     * *person*. They may play three times; they may not do it without
     * identifying three times.
     */
    public function testAPlayerMaySpinAsOftenAsTheyIdentify(): void
    {
        $this->register();
        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();

        $this->spinOnceMore(self::PHONE);
        $this->spinOnceMore(self::PHONE);

        self::assertSame(3, $this->countRows('spin'));

        $spins = $this->entityManager->getRepository(Spin::class)->findBy([]);
        foreach ($spins as $spin) {
            self::assertSame(self::PHONE, $spin->getPlayer()?->getPhone());
        }
    }

    // ------------------------------------------- F20: one spin per identity

    /**
     * F20 R5, R9. What a reload reads: before the spin there is nothing to
     * report, and after it there is the prize, the reward and the code.
     */
    public function testItReportsWhatThisIdentificationWon(): void
    {
        $this->register();

        $this->client->request('GET', self::ME_URI);
        self::assertNull($this->decodeResponse()['spin'], 'Nothing has been spun yet.');

        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();
        $won = $this->decodeResponse();

        $this->client->request('GET', self::ME_URI);
        $reported = $this->decodeResponse();

        self::assertSame('Anh', $reported['player']['firstName'], 'The player is still identified.');
        self::assertNotNull($reported['spin']);
        self::assertSame($won['prize']['name'], $reported['spin']['prizeName']);
        self::assertSame($won['reward'], $reported['spin']['reward'], 'A reload must not change what was won.');
        self::assertSame($won['spunAt'], $reported['spin']['spunAt']);
    }

    /**
     * F20 R7. The spin's own snapshot, so a reload still names the prize
     * after an admin has tidied the slice away (F02 R10).
     */
    public function testItStillNamesAPrizeWhoseSliceIsGone(): void
    {
        $this->register();

        $this->client->request('POST', self::SPIN_URI);
        $won = $this->decodeResponse()['prize']['name'];

        $this->entityManager->getConnection()->executeStatement('DELETE FROM prize');
        $this->entityManager->clear();

        $this->client->request('GET', self::ME_URI);

        self::assertSame($won, $this->decodeResponse()['spin']['prizeName']);
    }

    /** F20 R10: handing over clears the spin as well as the name. */
    public function testHandingOverReturnsTheSpinAsWellAsTheIdentity(): void
    {
        $this->register();
        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();

        $this->post(self::FORGET_URI);

        $this->client->request('GET', self::ME_URI);
        self::assertNull($this->decodeResponse()['player']);
        self::assertNull($this->decodeResponse()['spin']);

        // And the next identification gets a spin of its own.
        $this->post(self::IDENTIFY_URI, ['phone' => self::PHONE]);
        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();
        self::assertSame(2, $this->countRows('spin'));
    }

    /**
     * F20 R14. An admin deleting a spin out from under a session must not
     * leave a page that can never spin again and cannot say why.
     */
    public function testASessionNamingADeletedSpinIsTreatedAsNotHavingSpun(): void
    {
        $this->register();
        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();

        $this->entityManager->getConnection()->executeStatement('DELETE FROM spin');
        $this->entityManager->clear();

        $this->client->request('GET', self::ME_URI);
        self::assertNull($this->decodeResponse()['spin']);

        $this->client->request('POST', self::SPIN_URI);
        self::assertResponseIsSuccessful();
    }

    /** F20 R9: an identification that has not spun is reported as it was. */
    public function testNobodyIsReportedWithNoSpinEither(): void
    {
        $this->client->request('GET', self::ME_URI);

        self::assertNull($this->decodeResponse()['player']);
        self::assertNull($this->decodeResponse()['spin']);
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

        // F13 R20 adds the reward block. Still no probability anywhere in
        // it, which is what this test is really guarding (F02 R2).
        self::assertSame(['prize', 'reward', 'spunAt'], array_keys($this->decodeResponse()));
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
            'birthDay' => 12,
            'birthMonth' => 3,
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
