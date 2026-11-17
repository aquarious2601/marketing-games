<?php

declare(strict_types=1);

namespace App\Tests\Dto;

use App\Dto\Violation;
use App\Dto\WheelDraft;
use App\Dto\WheelInputParser;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Translation\Loader\YamlFileLoader;
use Symfony\Component\Translation\Translator;

/**
 * The validation surface of F01. Every rule in section 6 that can be decided
 * without the database is decided here, so these run in milliseconds and are
 * the first place to look when a save is rejected.
 */
final class WheelInputParserTest extends TestCase
{
    /**
     * F13 R7: a slice has to say what it gives away. The parser only checks
     * the shape of the id — whether it names a reward that exists is the
     * writer's job — so any positive number exercises the same path.
     */
    private const REWARD_ID = 7;

    private WheelInputParser $parser;

    protected function setUp(): void
    {
        /*
         * A real translator over the real files (F12 R16), not a stub.
         *
         * The messages this test asserts are now in `translations/`, so a
         * stub returning the key would make every assertion here a test of
         * the stub. Loading English for real means this also fails if a key
         * is missing from the file, which is the mistake worth catching.
         */
        $translator = new Translator('en');
        $translator->addLoader('yaml', new YamlFileLoader());
        $translator->addResource('yaml', __DIR__.'/../../translations/messages.en.yaml', 'en');

        $this->parser = new WheelInputParser($translator);
    }

    public function testItAcceptsAValidConfiguration(): void
    {
        [$draft, $violations] = $this->parser->parse([
            'prizes' => [
                ['id' => 1, 'name' => 'Try again', 'probability' => 60, 'rewardId' => self::REWARD_ID],
                ['name' => 'Free gift', 'probability' => 40, 'rewardId' => self::REWARD_ID],
            ],
        ]);

        self::assertSame([], $violations);
        self::assertInstanceOf(WheelDraft::class, $draft);
        self::assertCount(2, $draft->prizes);

        self::assertSame(1, $draft->prizes[0]->id);
        self::assertSame(60, $draft->prizes[0]->probability);

        self::assertNull($draft->prizes[1]->id, 'A prize without an id is a new one.');
    }

    /**
     * F26 R13: a page that still sends a label is not refused for it.
     *
     * The admin bundle a browser is holding may predate F26, and locking it
     * out of saving to enforce a rule that costs nothing to ignore would be
     * the wrong trade. Every other case in this file sends a name too, so
     * they all exercise this; it is asserted once on purpose.
     */
    public function testANameOnAPrizeIsIgnoredRatherThanRefused(): void
    {
        [$draft, $violations] = $this->parser->parse([
            'prizes' => [
                ['name' => '   a label nobody reads   ', 'probability' => 50, 'rewardId' => self::REWARD_ID],
                ['name' => str_repeat('x', 500), 'probability' => 50, 'rewardId' => self::REWARD_ID],
            ],
        ]);

        self::assertSame([], $violations);
        self::assertNotNull($draft);
        self::assertCount(2, $draft->prizes);
    }

    /** F01 R6 */
    public function testItAllowsDuplicateNames(): void
    {
        [$draft, $violations] = $this->parser->parse([
            'prizes' => [
                ['name' => '5 euro voucher', 'probability' => 50, 'rewardId' => self::REWARD_ID],
                ['name' => '5 euro voucher', 'probability' => 50, 'rewardId' => self::REWARD_ID],
            ],
        ]);

        self::assertSame([], $violations);
        self::assertNotNull($draft);
    }

    /** F01 R8, R9 */
    public function testItRejectsATotalThatIsNot100AndNamesTheActualTotal(): void
    {
        [$draft, $violations] = $this->parser->parse([
            'prizes' => [
                ['name' => 'Try again', 'probability' => 60, 'rewardId' => self::REWARD_ID],
                ['name' => 'Free gift', 'probability' => 37, 'rewardId' => self::REWARD_ID],
            ],
        ]);

        self::assertNull($draft);
        self::assertSame('prizes', $violations[0]->field);
        self::assertStringContainsString('97', $violations[0]->message);
        self::assertStringContainsString('100', $violations[0]->message);
    }

    /** F01 R1 */
    public function testItRejectsFewerThanTwoPrizes(): void
    {
        [$draft, $violations] = $this->parser->parse([
            'prizes' => [['name' => 'Everyone wins', 'probability' => 100, 'rewardId' => self::REWARD_ID]],
        ]);

        self::assertNull($draft);
        self::assertStringContainsString('at least 2', $this->messagesFor('prizes', $violations));
    }

    /** F01 R1 */
    public function testItRejectsMoreThanTwelvePrizes(): void
    {
        $prizes = [];

        for ($i = 0; $i < 13; ++$i) {
            $prizes[] = ['name' => 'Prize '.$i, 'probability' => 0 === $i ? 88 : 1, 'rewardId' => self::REWARD_ID];
        }

        [$draft, $violations] = $this->parser->parse(['prizes' => $prizes]);

        self::assertNull($draft);
        self::assertStringContainsString('at most 12', $this->messagesFor('prizes', $violations));
    }

    public function testItAcceptsExactlyTwelvePrizes(): void
    {
        $prizes = [];

        for ($i = 0; $i < 12; ++$i) {
            $prizes[] = ['name' => 'Prize '.$i, 'probability' => 0 === $i ? 89 : 1, 'rewardId' => self::REWARD_ID];
        }

        [$draft, $violations] = $this->parser->parse(['prizes' => $prizes]);

        self::assertSame([], $violations);
        self::assertNotNull($draft);
    }

    /*
     * F01 R4's three name tests — blank, too long, and measured in characters
     * rather than bytes — went with the field in F26 R10. A slice can no
     * longer fail to save because of a label, because it has none; the
     * catalogue's own name rules are tested in RewardControllerTest.
     */

    /**
     * F01 R5. Rounding an admin's 2.6 to 3 would change the odds without
     * telling them, so a non-integer is refused outright.
     *
     */
    #[DataProvider('nonIntegerProbabilities')]
    public function testItRejectsAProbabilityThatIsNotAWholeNumber(mixed $probability): void
    {
        [$draft, $violations] = $this->parser->parse([
            'prizes' => [
                ['name' => 'Free gift', 'probability' => $probability, 'rewardId' => self::REWARD_ID],
                ['name' => 'Try again', 'probability' => 50, 'rewardId' => self::REWARD_ID],
            ],
        ]);

        self::assertNull($draft);
        self::assertSame('prizes[0].probability', $violations[0]->field);
        self::assertStringContainsString('whole number', $violations[0]->message);
    }

    /**
     * @return iterable<string, array{mixed}>
     */
    public static function nonIntegerProbabilities(): iterable
    {
        yield 'a float' => [2.5];
        yield 'a whole-valued float' => [50.0];
        yield 'a numeric string' => ['50'];
        yield 'a non-numeric string' => ['fifty'];
        yield 'null' => [null];
        yield 'a boolean' => [true];
        yield 'an array' => [[50]];
    }

    /**
     * F01 R5.
     *
     */
    #[DataProvider('probabilitiesOutOfRange')]
    public function testItRejectsAProbabilityOutsideOneToOneHundred(int $probability): void
    {
        [$draft, $violations] = $this->parser->parse([
            'prizes' => [
                ['name' => 'Free gift', 'probability' => $probability, 'rewardId' => self::REWARD_ID],
                ['name' => 'Try again', 'probability' => 50, 'rewardId' => self::REWARD_ID],
            ],
        ]);

        self::assertNull($draft);
        self::assertSame('prizes[0].probability', $violations[0]->field);
        self::assertStringContainsString('between 1 and 100', $violations[0]->message);
    }

    /**
     * @return iterable<string, array{int}>
     */
    public static function probabilitiesOutOfRange(): iterable
    {
        yield 'zero' => [0];
        yield 'negative' => [-5];
        yield 'above one hundred' => [101];
    }

    /**
     * The total is nonsense when a probability could not be read, so saying
     * "they total 50" on top of "that is not a number" would only mislead.
     */
    public function testItDoesNotComplainAboutTheTotalWhenAProbabilityIsUnreadable(): void
    {
        [, $violations] = $this->parser->parse([
            'prizes' => [
                ['name' => 'Free gift', 'probability' => 'fifty', 'rewardId' => self::REWARD_ID],
                ['name' => 'Try again', 'probability' => 50, 'rewardId' => self::REWARD_ID],
            ],
        ]);

        self::assertStringNotContainsString('total', $this->messagesFor('prizes', $violations));
    }

    public function testItReportsEveryProblemAtOnce(): void
    {
        [, $violations] = $this->parser->parse([
            'prizes' => [
                ['name' => '', 'probability' => 0, 'rewardId' => self::REWARD_ID],
                ['name' => 'Free gift', 'probability' => 200, 'rewardId' => self::REWARD_ID],
            ],
        ]);

        $fields = array_map(static fn (Violation $v): string => $v->field, $violations);

        self::assertContains('prizes[0].probability', $fields);
        self::assertContains('prizes[1].probability', $fields);
    }

    public function testItRejectsAnIdThatIsNotAPositiveWholeNumber(): void
    {
        [$draft, $violations] = $this->parser->parse([
            'prizes' => [
                ['id' => 0, 'name' => 'Free gift', 'probability' => 50, 'rewardId' => self::REWARD_ID],
                ['name' => 'Try again', 'probability' => 50, 'rewardId' => self::REWARD_ID],
            ],
        ]);

        self::assertNull($draft);
        self::assertSame('prizes[0].id', $violations[0]->field);
    }

    public function testItTreatsAnAbsentOrNullIdAsANewPrize(): void
    {
        [$draft, $violations] = $this->parser->parse([
            'prizes' => [
                ['id' => null, 'name' => 'Free gift', 'probability' => 50, 'rewardId' => self::REWARD_ID],
                ['name' => 'Try again', 'probability' => 50, 'rewardId' => self::REWARD_ID],
            ],
        ]);

        self::assertSame([], $violations);
        self::assertNotNull($draft);
        self::assertNull($draft->prizes[0]->id);
        self::assertNull($draft->prizes[1]->id);
    }

    #[DataProvider('malformedBodies')]
    public function testItRejectsAMalformedBody(mixed $payload, string $expectedField): void
    {
        [$draft, $violations] = $this->parser->parse($payload);

        self::assertNull($draft);
        self::assertNotEmpty($violations);
        self::assertSame($expectedField, $violations[0]->field);
    }

    /**
     * @return iterable<string, array{mixed, string}>
     */
    public static function malformedBodies(): iterable
    {
        yield 'not an object' => ['nonsense', ''];
        yield 'no prizes key' => [['wheel' => []], 'prizes'];
        yield 'prizes not an array' => [['prizes' => 'lots'], 'prizes'];
        yield 'prizes keyed, not a list' => [['prizes' => ['a' => ['name' => 'x', 'probability' => 100, 'rewardId' => self::REWARD_ID]]], 'prizes'];
        yield 'a prize that is not an object' => [['prizes' => ['just a string', 'another']], 'prizes[0]'];
    }

    /**
     * @param list<Violation> $violations
     */
    private function messagesFor(string $field, array $violations): string
    {
        $messages = array_map(
            static fn (Violation $v): string => $v->field === $field ? $v->message : '',
            $violations,
        );

        return implode(' ', $messages);
    }
}
