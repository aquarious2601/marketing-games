<?php

declare(strict_types=1);

namespace App\Dto;

use App\Entity\Reward;
use App\Reward\RewardType;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * Turns a submitted reward into something storable, or into the reasons it
 * is not (F13 R3, R4).
 *
 * Written by hand for the same reason the other two parsers are: a wrong
 * type should produce a message addressed to the field that caused it, and
 * every problem should come back in one pass.
 */
final class RewardInputParser
{
    public function __construct(
        private readonly TranslatorInterface $translator,
    ) {
    }

    /**
     * @return array{RewardDraft|null, list<Violation>}
     */
    public function parse(mixed $payload): array
    {
        if (!\is_array($payload)) {
            return [null, [new Violation('', $this->translator->trans('api.invalid_object'))]];
        }

        $violations = [];

        $name = $this->parseName($payload, $violations);
        $type = $this->parseType($payload, $violations);
        $value = null === $type ? null : $this->parseValue($payload, $type, $violations);
        $cost = null === $type ? null : $this->parseCost($payload, $type, $violations);

        if ([] !== $violations || null === $name || null === $type) {
            return [null, $violations];
        }

        return [new RewardDraft($name, $type, $value, $cost), []];
    }

    /**
     * @param array<mixed>    $payload
     * @param list<Violation> $violations
     */
    private function parseName(array $payload, array &$violations): ?string
    {
        $raw = $payload['name'] ?? null;

        if (!\is_string($raw) || '' === trim($raw)) {
            $violations[] = new Violation('name', $this->translator->trans('reward.name_required'));

            return null;
        }

        $name = trim($raw);

        // Counted in characters, not bytes, so an accented name is not
        // rejected for being a few bytes over.
        if (mb_strlen($name) > Reward::NAME_MAX_LENGTH) {
            $violations[] = new Violation(
                'name',
                $this->translator->trans('reward.name_too_long', ['%max%' => Reward::NAME_MAX_LENGTH]),
            );

            return null;
        }

        return $name;
    }

    /**
     * @param array<mixed>    $payload
     * @param list<Violation> $violations
     */
    private function parseType(array $payload, array &$violations): ?RewardType
    {
        $raw = $payload['type'] ?? null;
        $type = \is_string($raw) ? RewardType::tryFrom($raw) : null;

        if (null === $type) {
            $violations[] = new Violation(
                'type',
                $this->translator->trans('reward.type_invalid', [
                    '%values%' => implode(', ', array_column(RewardType::cases(), 'value')),
                ]),
            );

            return null;
        }

        return $type;
    }

    /**
     * F32 R1, R3, R4, R7.
     *
     * Absent is unpriced and absent is allowed: a shop that has not
     * worked out what a reward costs it should still be able to save the
     * reward. A cost on the losing item is **rejected** rather than
     * dropped, for the reason `parseValue` gives below: a number that
     * vanishes on save reads as a broken page.
     *
     * @param array<mixed>    $payload
     * @param list<Violation> $violations
     */
    private function parseCost(array $payload, RewardType $type, array &$violations): ?int
    {
        $raw = $payload['cost'] ?? null;

        if (null === $raw) {
            return null;
        }

        if (RewardType::Nothing === $type) {
            $violations[] = new Violation('cost', $this->translator->trans('reward.cost_not_allowed'));

            return null;
        }

        // Whole minor units, and not a numeric string, exactly as a value
        // is read: money in this application is always an integer.
        if (!\is_int($raw)) {
            $violations[] = new Violation('cost', $this->translator->trans('reward.cost_invalid'));

            return null;
        }

        // R3. Zero is allowed and means a reward that genuinely costs
        // nothing; below zero is not a cost.
        if ($raw < 0) {
            $violations[] = new Violation('cost', $this->translator->trans('reward.cost_invalid'));

            return null;
        }

        // F21 R3's ceiling, for F21 R3's reason: the column is wide but
        // not infinite, and a message beats a truncated number.
        if ($raw > RewardType::MAX_AMOUNT) {
            $violations[] = new Violation(
                'cost',
                $this->translator->trans('reward.amount_too_large', ['%max%' => RewardType::MAX_AMOUNT]),
            );

            return null;
        }

        return $raw;
    }

    /**
     * F13 R3.
     *
     * A value supplied for a type that takes none is **rejected**, not
     * dropped. Silently discarding it means an admin who typed 10 against a
     * free product sees it vanish on save with no explanation and assumes
     * the page is broken.
     *
     * @param array<mixed>    $payload
     * @param list<Violation> $violations
     */
    private function parseValue(array $payload, RewardType $type, array &$violations): ?int
    {
        $raw = $payload['value'] ?? null;

        if (!$type->needsValue()) {
            if (null !== $raw) {
                $violations[] = new Violation('value', $this->translator->trans('reward.value_not_allowed'));
            }

            return null;
        }

        // Whole numbers only, and not a numeric string: rounding somebody's
        // 7.5% into 8 changes what the shop is giving away.
        if (!\is_int($raw)) {
            $violations[] = new Violation('value', $this->translator->trans('reward.value_required'));

            return null;
        }

        if (RewardType::PercentOff === $type) {
            if ($raw < RewardType::MIN_PERCENT || $raw > RewardType::MAX_PERCENT) {
                $violations[] = new Violation(
                    'value',
                    $this->translator->trans('reward.percent_out_of_range', [
                        '%min%' => RewardType::MIN_PERCENT,
                        '%max%' => RewardType::MAX_PERCENT,
                    ]),
                );

                return null;
            }

            return $raw;
        }

        if ($raw < RewardType::MIN_AMOUNT) {
            $violations[] = new Violation(
                'value',
                $this->translator->trans('reward.amount_too_small', ['%min%' => RewardType::MIN_AMOUNT]),
            );

            return null;
        }

        /*
         * F21 R3. There was no ceiling here until a column that stops at
         * 32,767 met a 50,000 dong promotion: on a loose database the value
         * was silently truncated, and on a strict one the save was a 500.
         * The column is wider now, and this is what keeps the answer a
         * message rather than either of those.
         */
        if ($raw > RewardType::MAX_AMOUNT) {
            $violations[] = new Violation(
                'value',
                $this->translator->trans('reward.amount_too_large', ['%max%' => RewardType::MAX_AMOUNT]),
            );

            return null;
        }

        return $raw;
    }
}
