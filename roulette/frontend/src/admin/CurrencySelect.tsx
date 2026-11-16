import type { CurrencyOption } from '../api/branding'

interface CurrencySelectProps {
  id: string
  value: string
  options: CurrencyOption[]
  disabled?: boolean
  onChange: (currency: string) => void
  'aria-label'?: string
}

/**
 * The campaign's currency (F15 R7, R10).
 *
 * One component in two places — the reward editor, where the admin types
 * the amount, and the branding section, where the campaign's other
 * settings are. They edit the same value, so they had better offer the
 * same list in the same words.
 *
 * The options come from the server with their symbols (F15 R14); nothing
 * here knows that EUR is €.
 */
export function CurrencySelect({
  id,
  value,
  options,
  disabled = false,
  onChange,
  'aria-label': ariaLabel,
}: CurrencySelectProps) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      data-testid="currency-select"
      className={[
        'rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900',
        'focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
      ].join(' ')}
    >
      {options.map((currency) => (
        // The code and the symbol together: the code needs no translating,
        // which keeps this list out of the four dictionaries, and the
        // symbol is what will appear on the player's screen.
        <option key={currency.value} value={currency.value}>
          {currency.label} {currency.symbol}
        </option>
      ))}
    </select>
  )
}

/** The symbol for a code, falling back to the code itself. */
export function symbolFor(options: CurrencyOption[], value: string): string {
  return options.find((currency) => currency.value === value)?.symbol ?? value
}
