<?php

declare(strict_types=1);

namespace App\Dto;

use App\Entity\Prize;
use App\Entity\Wheel;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * Turns a decoded request body into a WheelDraft, or into the list of reasons
 * it cannot be one (F01 R12).
 *
 * This is written by hand rather than through the serializer so that a wrong
 * type produces a message the admin can act on, addressed to the exact field,
 * instead of a deserialization exception. It collects every problem in one
 * pass: an admin fixing a form should not have to save six times to discover
 * six mistakes.
 */
final class WheelInputParser
{
    /**
     * F12 R16: translated where the message is written, from the request's
     * locale.
     */
    public function __construct(
        private readonly TranslatorInterface $translator,
    ) {
    }

    /**
     * @return array{WheelDraft|null, list<Violation>}
     */
    public function parse(mixed $payload): array
    {
        if (!\is_array($payload)) {
            return [null, [new Violation('', $this->translator->trans('api.invalid_object'))]];
        }

        if (!\array_key_exists('prizes', $payload) || !\is_array($payload['prizes'])) {
            return [null, [new Violation('prizes', $this->translator->trans('wheel.prizes_required'))]];
        }

        /** @var array<mixed> $rawPrizes */
        $rawPrizes = $payload['prizes'];

        // A JSON object would arrive as an associative array; the order of a
        // wheel is meaningful, so only a real list is acceptable.
        if (!array_is_list($rawPrizes)) {
            return [null, [new Violation('prizes', $this->translator->trans('wheel.prizes_must_be_list'))]];
        }

        $violations = [];
        $count = \count($rawPrizes);

        // F01 R1
        if ($count < Wheel::MIN_PRIZES) {
            $violations[] = new Violation(
                'prizes',
                $this->translator->trans('wheel.too_few_prizes', [
                    '%min%' => Wheel::MIN_PRIZES,
                    '%count%' => $count,
                ]),
            );
        }

        if ($count > Wheel::MAX_PRIZES) {
            $violations[] = new Violation(
                'prizes',
                $this->translator->trans('wheel.too_many_prizes', [
                    '%max%' => Wheel::MAX_PRIZES,
                    '%count%' => $count,
                ]),
            );
        }

        $prizes = [];
        $total = 0;
        $everyProbabilityValid = true;

        foreach ($rawPrizes as $index => $rawPrize) {
            if (!\is_array($rawPrize)) {
                $violations[] = new Violation(
                    sprintf('prizes[%d]', $index),
                    $this->translator->trans('wheel.prize_must_be_object'),
                );
                $everyProbabilityValid = false;

                continue;
            }

            $id = $this->parseId($rawPrize, $index, $violations);
            $name = $this->parseName($rawPrize, $index, $violations);
            $probability = $this->parseProbability($rawPrize, $index, $violations);

            if (null === $probability) {
                $everyProbabilityValid = false;
            } else {
                $total += $probability;
            }

            if (null !== $name && null !== $probability) {
                $prizes[] = new PrizeDraft($id, $name, $probability);
            }
        }

        // F01 R8, R9. Only worth saying when every probability was readable;
        // otherwise the total is meaningless and the message would mislead.
        if ($everyProbabilityValid && $total !== Wheel::REQUIRED_TOTAL_PROBABILITY) {
            $violations[] = new Violation(
                'prizes',
                $this->translator->trans('wheel.probability_total', [
                    '%required%' => Wheel::REQUIRED_TOTAL_PROBABILITY,
                    '%total%' => $total,
                ]),
            );
        }

        if ([] !== $violations) {
            return [null, $violations];
        }

        return [new WheelDraft($prizes), []];
    }

    /**
     * @param array<mixed>    $rawPrize
     * @param list<Violation> $violations
     */
    private function parseId(array $rawPrize, int $index, array &$violations): ?int
    {
        if (!\array_key_exists('id', $rawPrize) || null === $rawPrize['id']) {
            return null;
        }

        $id = $rawPrize['id'];

        if (!\is_int($id) || $id < 1) {
            $violations[] = new Violation(
                sprintf('prizes[%d].id', $index),
                $this->translator->trans('wheel.prize_id_invalid'),
            );

            return null;
        }

        return $id;
    }

    /**
     * @param array<mixed>    $rawPrize
     * @param list<Violation> $violations
     */
    private function parseName(array $rawPrize, int $index, array &$violations): ?string
    {
        $field = sprintf('prizes[%d].name', $index);
        $name = $rawPrize['name'] ?? null;

        if (!\is_string($name)) {
            $violations[] = new Violation($field, $this->translator->trans('wheel.prize_name_required'));

            return null;
        }

        // F01 R4
        $name = trim($name);

        if ('' === $name) {
            $violations[] = new Violation($field, $this->translator->trans('wheel.prize_name_required'));

            return null;
        }

        // Counted in characters, not bytes, so an accented name is not
        // rejected for being one byte over.
        if (mb_strlen($name) > Prize::NAME_MAX_LENGTH) {
            $violations[] = new Violation(
                $field,
                $this->translator->trans('wheel.prize_name_too_long', ['%max%' => Prize::NAME_MAX_LENGTH]),
            );

            return null;
        }

        return $name;
    }

    /**
     * @param array<mixed>    $rawPrize
     * @param list<Violation> $violations
     */
    private function parseProbability(array $rawPrize, int $index, array &$violations): ?int
    {
        $field = sprintf('prizes[%d].probability', $index);
        $probability = $rawPrize['probability'] ?? null;

        // F01 R5: whole numbers only. A float or a numeric string is rejected
        // rather than coerced, because silently rounding an admin's 2.6 into
        // a 3 changes the odds behind their back.
        if (!\is_int($probability)) {
            $violations[] = new Violation($field, $this->translator->trans('wheel.probability_not_whole'));

            return null;
        }

        if ($probability < Prize::MIN_PROBABILITY || $probability > Prize::MAX_PROBABILITY) {
            $violations[] = new Violation(
                $field,
                $this->translator->trans('wheel.probability_out_of_range', [
                    '%min%' => Prize::MIN_PROBABILITY,
                    '%max%' => Prize::MAX_PROBABILITY,
                ]),
            );

            return null;
        }

        return $probability;
    }
}
