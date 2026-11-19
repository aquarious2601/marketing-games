<?php

declare(strict_types=1);

namespace App\Game;

use App\Entity\Game;
use App\Games\GiftSheet\Repository\GiftRepository;
use App\Games\Wheel\Entity\Wheel;
use App\Games\Wheel\Repository\WheelRepository;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * Whether a game is fit to be turned live (F27 R43).
 *
 * Its own class because every game type answers it differently and the list
 * of types grows: a wheel has to total 100 and have a reward on every slice,
 * a sheet has to have something on it (F28 R7). A controller that knew all
 * of that would have to be edited for every new type, which is exactly what
 * P05 separated the games to avoid.
 */
final class GameReadiness
{
    public function __construct(
        private readonly WheelRepository $wheels,
        private readonly GiftRepository $gifts,
        private readonly TranslatorInterface $translator,
    ) {
    }

    /**
     * What stops this game going live, or null when nothing does.
     *
     * A sentence rather than a boolean, because R43 says the refusal names
     * what is wrong: "it is not ready" sends an admin hunting through two
     * forms for the thing they have not filled in.
     */
    public function whyNotLive(Game $game): ?string
    {
        return match ($game->getType()) {
            GameType::Wheel => $this->whyNotAWheel($game),
            GameType::GiftSheet => $this->whyNotASheet($game),
        };
    }

    /**
     * F28 R7. A sheet with nothing on it would identify a player, take their
     * details and hand them nothing — the one state worse than not being
     * live at all.
     */
    private function whyNotASheet(Game $game): ?string
    {
        return 0 === $this->gifts->countOnSheet($game)
            ? $this->translator->trans('game.not_ready_empty_sheet')
            : null;
    }

    private function whyNotAWheel(Game $game): ?string
    {
        $wheel = $this->wheels->findForGame($game);

        if (!$wheel instanceof Wheel) {
            return $this->translator->trans('game.not_ready_no_wheel');
        }

        $prizes = $wheel->getPrizes();
        $count = \count($prizes);

        if ($count < Wheel::MIN_PRIZES || $count > Wheel::MAX_PRIZES) {
            return $this->translator->trans('game.not_ready_prize_count', [
                '%min%' => Wheel::MIN_PRIZES,
                '%max%' => Wheel::MAX_PRIZES,
            ]);
        }

        $total = 0;

        foreach ($prizes as $prize) {
            // F13 R7. Checked here as well as on save, because a wheel saved
            // before that rule existed can still be sitting in a database.
            if (null === $prize->getReward()) {
                return $this->translator->trans('game.not_ready_slice_without_reward');
            }

            $total += $prize->getProbability();
        }

        if (Wheel::REQUIRED_TOTAL_PROBABILITY !== $total) {
            return $this->translator->trans('game.not_ready_total', [
                '%total%' => $total,
                '%required%' => Wheel::REQUIRED_TOTAL_PROBABILITY,
            ]);
        }

        return null;
    }
}
