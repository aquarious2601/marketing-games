<?php

declare(strict_types=1);

namespace App\Reward;

/**
 * What a reward actually is (F13 R2).
 *
 * `Nothing` is a type rather than a flag on the slice, which is the decision
 * that keeps the rest of the feature simple: the draw, the recording, the
 * log and the snapshot all treat a losing item exactly like any other, and
 * precisely one place — the claim — asks what type it is. A boolean would
 * have put `if (!losing)` in five places and missed one.
 */
enum RewardType: string
{
    case FreeProduct = 'free_product';
    case PercentOff = 'percent_off';
    case AmountOff = 'amount_off';
    case Nothing = 'nothing';

    /** F13 R3: percent off is 1–100. */
    public const MIN_PERCENT = 1;
    public const MAX_PERCENT = 100;

    /** F13 R3: an amount off is a positive whole number of the campaign's currency. */
    public const MIN_AMOUNT = 1;

    /**
     * A value already in the database that we no longer recognise reads as a
     * free product rather than throwing, so one bad row cannot take the
     * admin page down with it. Input is validated on the way in instead.
     */
    public static function fromStorage(?string $value): self
    {
        return self::tryFrom((string) $value) ?? self::FreeProduct;
    }

    /** F13 R3. */
    public function needsValue(): bool
    {
        return self::PercentOff === $this || self::AmountOff === $this;
    }

    /**
     * F13 R16, R19: only a discount is worth a code. A free product is
     * claimed by showing the screen, and a losing item has nothing to claim.
     */
    public function needsCode(): bool
    {
        return $this->needsValue();
    }

    /** F13 R15, R24: a losing item is drawn and logged, but never claimed. */
    public function isClaimable(): bool
    {
        return self::Nothing !== $this;
    }

    /**
     * The key this type's name is translated under (F12 R9).
     *
     * Here rather than built by the caller, so adding a type and forgetting
     * its wording fails in TranslationsTest instead of putting a raw
     * `reward.type.voucher` on the admin's screen.
     */
    public function labelKey(): string
    {
        return 'reward.type.'.$this->value;
    }

    /**
     * @return list<array{value: string, label: string}> with the labels left
     *                                                   untranslated; the controller translates them
     */
    public static function values(): array
    {
        return array_map(
            static fn (self $type): array => ['value' => $type->value, 'label' => $type->labelKey()],
            self::cases(),
        );
    }
}
