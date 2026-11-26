<?php

declare(strict_types=1);

namespace App\Dto;

use App\Entity\Player;
use App\Player\PhoneNumber;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * Turns a decoded request body into a phone number, or into a PlayerDraft, or
 * into the reasons it can be neither (F08 R4, R10).
 *
 * Written by hand for the same reason WheelInputParser is: a wrong type
 * should produce a message addressed to the field that caused it, and every
 * problem should come back in one pass. Somebody standing at a stall with a
 * phone in one hand will not submit a form four times to discover four
 * mistakes.
 */
final class PlayerInputParser
{
    /**
     * F12 R16: messages are translated here, where they are written, from
     * the locale Symfony negotiated for the request. The alternative was to
     * emit keys and let the browser do the wording, which means every
     * message exists twice with nothing keeping the two in step.
     */
    public function __construct(
        private readonly TranslatorInterface $translator,
    ) {
    }

    /**
     * Just the number, for the lookup step (F08 R5).
     *
     * @return array{string|null, list<Violation>}
     */
    public function parsePhone(mixed $payload): array
    {
        if (!\is_array($payload)) {
            return [null, [new Violation('', $this->translator->trans('api.invalid_object'))]];
        }

        $violations = [];
        $phone = $this->phoneFrom($payload, $violations);

        return [$phone, $violations];
    }

    /**
     * The whole registration (F08 R6).
     *
     * @return array{PlayerDraft|null, list<Violation>}
     */
    public function parseRegistration(mixed $payload): array
    {
        if (!\is_array($payload)) {
            return [null, [new Violation('', $this->translator->trans('api.invalid_object'))]];
        }

        $violations = [];

        $phone = $this->phoneFrom($payload, $violations);
        $firstName = $this->nameFrom($payload, 'firstName', $violations);
        $lastName = $this->nameFrom($payload, 'lastName', $violations);
        $birthday = $this->birthdayFrom($payload, $violations);

        if ([] !== $violations || null === $phone || null === $firstName || null === $lastName || null === $birthday) {
            return [null, $violations];
        }

        return [new PlayerDraft($phone, $firstName, $lastName, $birthday[0], $birthday[1]), []];
    }

    /**
     * @param array<mixed>    $payload
     * @param list<Violation> $violations
     */
    private function phoneFrom(array $payload, array &$violations): ?string
    {
        $raw = $payload['phone'] ?? null;

        // A number arriving as a JSON number rather than a string is rejected
        // rather than cast: a leading zero is the most load-bearing digit in
        // a national number and JSON has already eaten it.
        if (!\is_string($raw) || '' === trim($raw)) {
            $violations[] = new Violation('phone', $this->translator->trans('player.phone_required'));

            return null;
        }

        $phone = PhoneNumber::canonicalise($raw);

        if (null === $phone) {
            $violations[] = new Violation(
                'phone',
                $this->translator->trans('player.phone_invalid', [
                    '%min%' => Player::MIN_PHONE_DIGITS,
                    '%max%' => Player::MAX_PHONE_DIGITS,
                ]),
            );

            return null;
        }

        return $phone;
    }

    /**
     * @param array<mixed>    $payload
     * @param list<Violation> $violations
     */
    private function nameFrom(array $payload, string $field, array &$violations): ?string
    {
        $raw = $payload[$field] ?? null;

        /*
         * A key per field rather than one message with the field name
         * interpolated into it. "Enter your %s" works in English and falls
         * apart elsewhere: French needs votre/votre but Vietnamese reorders
         * the sentence, and a translator handed a sentence with a hole in it
         * cannot fix that. Two keys cost nothing and can each be a whole
         * sentence in their own language.
         */
        $required = sprintf('player.%s_required', 'firstName' === $field ? 'first_name' : 'last_name');
        $tooLong = sprintf('player.%s_too_long', 'firstName' === $field ? 'first_name' : 'last_name');

        if (!\is_string($raw)) {
            $violations[] = new Violation($field, $this->translator->trans($required));

            return null;
        }

        $name = trim($raw);

        if ('' === $name) {
            $violations[] = new Violation($field, $this->translator->trans($required));

            return null;
        }

        // Counted in characters, not bytes, so Nguyễn is six characters and
        // not nine.
        if (mb_strlen($name) > Player::NAME_MAX_LENGTH) {
            $violations[] = new Violation(
                $field,
                $this->translator->trans($tooLong, ['%max%' => Player::NAME_MAX_LENGTH]),
            );

            return null;
        }

        return $name;
    }

    /**
     * @param array<mixed>    $payload
     * @param list<Violation> $violations
     */
    /**
     * F38 R1, R3. The day and the month, and nothing that says an age.
     *
     * Returned as a pair rather than a date: there is no year to make one
     * out of, and inventing one here would put a number in the database
     * that nobody chose.
     *
     * @param array<mixed>    $payload
     * @param list<Violation> $violations
     *
     * @return array{int, int}|null
     */
    private function birthdayFrom(array $payload, array &$violations): ?array
    {
        $day = $this->numberFrom($payload, 'birthDay');
        $month = $this->numberFrom($payload, 'birthMonth');

        if (null === $day || null === $month) {
            $violations[] = new Violation('birthday', $this->translator->trans('player.birthday_required'));

            return null;
        }

        if ($day < 1 || $day > 31 || $month < 1 || $month > 12) {
            $violations[] = new Violation('birthday', $this->translator->trans('player.birthday_invalid'));

            return null;
        }

        /*
         * R3. 31 February is not a birthday; 29 February is somebody's.
         * Checked in a leap year on purpose, so the one date that exists
         * every four years is not refused in the other three.
         */
        if (!checkdate($month, $day, 2024)) {
            $violations[] = new Violation(
                'birthday',
                $this->translator->trans('player.birthday_impossible'),
            );

            return null;
        }

        return [$day, $month];
    }

    /**
     * A whole number from the payload, however the client sent it.
     *
     * A select sends "3" and a JSON client sends 3; both mean March, and
     * refusing one of them would be refusing a client for its taste in
     * types rather than for what it said.
     *
     * @param array<mixed> $payload
     */
    private function numberFrom(array $payload, string $key): ?int
    {
        /** @var mixed $raw */
        $raw = $payload[$key] ?? null;

        if (\is_int($raw)) {
            return $raw;
        }

        return \is_string($raw) && 1 === preg_match('/^\d{1,2}$/', trim($raw))
            ? (int) trim($raw)
            : null;
    }
}
