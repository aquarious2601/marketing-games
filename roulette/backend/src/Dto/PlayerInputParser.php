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

        return [new PlayerDraft($phone, $firstName, $lastName, $birthday), []];
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
    private function birthdayFrom(array $payload, array &$violations): ?\DateTimeImmutable
    {
        $raw = $payload['birthday'] ?? null;

        if (!\is_string($raw) || '' === trim($raw)) {
            $violations[] = new Violation('birthday', $this->translator->trans('player.birthday_required'));

            return null;
        }

        // createFromFormat with a `!` resets the time, so two birthdays on the
        // same day are the same value. Without it the unset fields default to
        // now and every comparison depends on what time the form was sent.
        $birthday = \DateTimeImmutable::createFromFormat('!Y-m-d', trim($raw), new \DateTimeZone('UTC'));

        // A format match is not enough: PHP accepts 2026-02-31 and rolls it
        // into March, so the parsed date is compared back against the input.
        if (false === $birthday || $birthday->format('Y-m-d') !== trim($raw)) {
            $violations[] = new Violation('birthday', $this->translator->trans('player.birthday_invalid'));

            return null;
        }

        $today = new \DateTimeImmutable('today', new \DateTimeZone('UTC'));

        if ($birthday > $today) {
            $violations[] = new Violation('birthday', $this->translator->trans('player.birthday_future'));

            return null;
        }

        if ($birthday < new \DateTimeImmutable(Player::EARLIEST_BIRTHDAY, new \DateTimeZone('UTC'))) {
            $violations[] = new Violation('birthday', $this->translator->trans('player.birthday_too_early'));

            return null;
        }

        return $birthday;
    }
}
