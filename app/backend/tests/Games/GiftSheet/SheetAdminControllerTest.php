<?php

declare(strict_types=1);

namespace App\Tests\Games\GiftSheet;

use App\Entity\Game;
use App\Game\GameType;
use App\Games\GiftSheet\Entity\Gift;
use App\Tests\Support\DatabaseWebTestCase;
use Symfony\Component\HttpFoundation\Response;

/**
 * F28 R2–R7, R21–R24: configuring what a sheet gives away.
 *
 * The three rules a form could forget are all here: a reward appears once
 * (R2), the losing reward never (R5), and at most six because that is what
 * fits a phone (R3).
 */
final class SheetAdminControllerTest extends DatabaseWebTestCase
{
    private Game $sheetGame;

    protected function setUp(): void
    {
        parent::setUp();

        $this->signInAsAdmin();

        $this->sheetGame = new Game($this->store, 'Welcome pack', GameType::GiftSheet);
        $this->entityManager->persist($this->sheetGame);
        $this->entityManager->flush();
    }

    public function testANewSheetIsEmpty(): void
    {
        $this->client->request('GET', $this->uri());

        self::assertResponseIsSuccessful();
        self::assertSame([], $this->decodeResponse()['gifts']);
        self::assertSame(Gift::MAX_PER_SHEET, $this->decodeResponse()['maxGifts']);
    }

    /** F28 R1, R6: a list of rewards in the admin's order. */
    public function testItSavesTheListInOrder(): void
    {
        $first = $this->aRewardId('Free coffee');
        $second = $this->aRewardId('Tote bag');

        $this->put($this->uri(), ['gifts' => [['rewardId' => $second], ['rewardId' => $first]]]);

        self::assertResponseIsSuccessful();
        self::assertSame(
            ['Tote bag', 'Free coffee'],
            array_column($this->decodeResponse()['gifts'], 'name'),
        );
    }

    /** F28 R6: and a reorder is a save, not a surprise. */
    public function testItReordersAnExistingSheet(): void
    {
        $first = $this->aRewardId('Free coffee');
        $second = $this->aRewardId('Tote bag');

        $this->put($this->uri(), ['gifts' => [['rewardId' => $first], ['rewardId' => $second]]]);
        $this->put($this->uri(), ['gifts' => [['rewardId' => $second], ['rewardId' => $first]]]);

        self::assertResponseIsSuccessful();
        self::assertSame(
            ['Tote bag', 'Free coffee'],
            array_column($this->decodeResponse()['gifts'], 'name'),
        );
    }

    /** F28 R4: a gift's name is its reward's name, never typed separately. */
    public function testAGiftTakesItsRewardsName(): void
    {
        $this->put($this->uri(), ['gifts' => [['rewardId' => $this->aRewardId('Free coffee')]]]);

        self::assertSame('Free coffee', $this->decodeResponse()['gifts'][0]['name']);
    }

    /**
     * F28 R2. The opposite of the wheel, where two slices on one reward is
     * how a wheel gives better odds (F26 R4).
     */
    public function testItRefusesTheSameRewardTwice(): void
    {
        $reward = $this->aRewardId('Free coffee');

        $this->put($this->uri(), ['gifts' => [['rewardId' => $reward], ['rewardId' => $reward]]]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('gifts[1]', $this->decodeResponse()['error']['violations'][0]['field']);
    }

    /** F28 R5: a sheet gives everything on it, so "you have not won" cannot be on one. */
    public function testItRefusesTheLosingReward(): void
    {
        $this->put($this->uri(), ['gifts' => [['rewardId' => $this->aLosingRewardId()]]]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
    }

    /** F28 R3: six, because that is what fits a phone without scrolling. */
    public function testItRefusesASeventhGift(): void
    {
        $gifts = [];

        foreach (range(1, Gift::MAX_PER_SHEET + 1) as $each) {
            $gifts[] = ['rewardId' => $this->aRewardId('Gift '.$each)];
        }

        $this->put($this->uri(), ['gifts' => $gifts]);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('gifts', $this->decodeResponse()['error']['violations'][0]['field']);
    }

    public function testItAcceptsExactlySixGifts(): void
    {
        $gifts = [];

        foreach (range(1, Gift::MAX_PER_SHEET) as $each) {
            $gifts[] = ['rewardId' => $this->aRewardId('Gift '.$each)];
        }

        $this->put($this->uri(), ['gifts' => $gifts]);

        self::assertResponseIsSuccessful();
        self::assertCount(Gift::MAX_PER_SHEET, $this->decodeResponse()['gifts']);
    }

    /** F28 R1: emptying the list is how an admin clears a sheet. */
    public function testItAcceptsAnEmptyList(): void
    {
        $this->put($this->uri(), ['gifts' => [['rewardId' => $this->aRewardId('Free coffee')]]]);
        $this->put($this->uri(), ['gifts' => []]);

        self::assertResponseIsSuccessful();
        self::assertSame([], $this->decodeResponse()['gifts']);
    }

    /** F28 R7, F27 R43: and an empty one cannot go live. */
    public function testAnEmptySheetCannotGoLive(): void
    {
        $this->put('/api/admin/games/'.$this->sheetId().'/live', ['live' => true]);

        self::assertResponseStatusCodeSame(Response::HTTP_CONFLICT);
    }

    public function testASheetWithAGiftOnItCanGoLive(): void
    {
        $this->put($this->uri(), ['gifts' => [['rewardId' => $this->aRewardId('Free coffee')]]]);

        $this->put('/api/admin/games/'.$this->sheetId().'/live', ['live' => true]);

        self::assertResponseIsSuccessful();
        self::assertTrue($this->decodeResponse()['isLive']);
    }

    /** F28 R26: one catalogue, several games. */
    public function testARewardMayBeOnASheetAndOnAWheelAtOnce(): void
    {
        $shared = $this->aRewardId('Free coffee');

        $this->put($this->uri(), ['gifts' => [['rewardId' => $shared]]]);
        self::assertResponseIsSuccessful();

        $this->put($this->wheelUri(), ['prizes' => [
            ['probability' => 50, 'rewardId' => $shared],
            ['probability' => 50, 'rewardId' => $this->aRewardId('Tote bag')],
        ]]);

        self::assertResponseIsSuccessful();
    }

    /** The wheel's endpoint and the sheet's each refuse the other's game. */
    public function testTheSheetEndpointRefusesAWheelGame(): void
    {
        $this->client->request('GET', '/api/admin/games/'.$this->game->getId().'/sheet');

        self::assertResponseStatusCodeSame(Response::HTTP_NOT_FOUND);
    }

    private function uri(): string
    {
        return '/api/admin/games/'.$this->sheetId().'/sheet';
    }

    private function sheetId(): int
    {
        $id = $this->sheetGame->getId();
        \assert(null !== $id);

        return $id;
    }
}
