import { describe, expect, it } from 'vitest'
import { QUIET_ZONE, SYMBOLS, checkSymbol, encode } from './code128'

/**
 * F33 R4, and the reason the table in `code128.ts` is written by hand rather
 * than installed.
 *
 * The standard gives every symbol three properties, and a mistyped digit
 * breaks at least one of them: eleven modules, six elements, and an even
 * number of bar modules. The stop symbol is the one exception and is
 * exceptional in a stated way — thirteen modules in seven elements, because
 * a symbol that ends the code has to end on a bar.
 */
describe('the symbol table', () => {
  const STOP = 106

  it('holds every symbol the standard defines', () => {
    expect(SYMBOLS).toHaveLength(107)
  })

  it.each(SYMBOLS.map((pattern, value) => ({ value, pattern })))(
    'symbol $value is $pattern, eleven modules in six elements',
    ({ value, pattern }) => {
      const widths = [...pattern].map(Number)

      expect(widths).toHaveLength(STOP === value ? 7 : 6)
      expect(widths.reduce((total, width) => total + width, 0)).toBe(
        STOP === value ? 13 : 11,
      )
      expect(widths.every((width) => width >= 1 && width <= 4)).toBe(true)
    },
  )

  /** The property that catches a transposition the width sum would not. */
  it.each(SYMBOLS.map((pattern, value) => ({ value, pattern })))(
    'symbol $value has an even number of bar modules',
    ({ pattern }) => {
      const bars = [...pattern]
        .map(Number)
        .filter((_, index) => 0 === index % 2)
        .reduce((total, width) => total + width, 0)

      expect(bars % 2).toBe(0)
    },
  )
})

/** F33 R4. */
describe('the check symbol', () => {
  /*
   * Worked out by hand from the standard, which is the only way this number
   * is worth anything: start B is 104, each character counts by its
   * one-based position, and the total is taken modulo 103.
   *
   *   M=45 9=25 P=48 X=56 K=43 4=20 T=52 7=23
   *   104 + 45 + 2(25) + 3(48) + 4(56) + 5(43) + 6(20) + 7(52) + 8(23)
   *     = 104 + 45 + 50 + 144 + 224 + 215 + 120 + 364 + 184
   *     = 1450
   *   1450 - 14(103) = 1450 - 1442 = 8
   */
  it('is the weighted sum of the code, modulo 103', () => {
    expect(checkSymbol('M9PXK4T7')).toBe(8)
  })

  /** R2. The hyphen is grouping for eyes, not data. */
  it('ignores the hyphen', () => {
    expect(checkSymbol('M9PX-K4T7')).toBe(checkSymbol('M9PXK4T7'))
  })

  it('is nothing for a code it cannot carry', () => {
    expect(checkSymbol('M9PX-K4T€')).toBeNull()
  })
})

/** F33 R2, R4, R10. */
describe('encoding a reward code', () => {
  const START_B = '211214'
  const STOP = '2331112'

  it('is a start symbol, the code, a check symbol and a stop symbol', () => {
    const elements = encode('M9PX-K4T7') ?? []

    // Eight characters: ten symbols of six elements, then the stop's seven.
    expect(elements).toHaveLength(10 * 6 + 7)

    const widths = elements.join('')

    expect(widths.startsWith(START_B)).toBe(true)
    expect(widths.endsWith(STOP)).toBe(true)
    // The check symbol is the six elements before the stop's seven.
    expect(widths.slice(-7 - 6, -7)).toBe('132212')
  })

  /**
   * The number that decides whether the thing scans: eight characters is 123
   * modules, and with R7's quiet zones 143. Measured in the result panel at
   * 375px that is 1.83px a module — R8's floor, and about 0.32mm on a real
   * phone — so this is a test and not a comment.
   */
  it('is 123 modules wide, 143 with its quiet zones', () => {
    const modules = (encode('M9PX-K4T7') ?? []).reduce(
      (total, width) => total + width,
      0,
    )

    expect(modules).toBe(123)
    expect(modules + QUIET_ZONE * 2).toBe(143)
  })

  it('encodes the hyphen as nothing at all', () => {
    expect(encode('M9PX-K4T7')).toEqual(encode('M9PXK4T7'))
  })

  it.each(['M9PX-K4T€', 'Ⅿ9PX-K4T7', 'code\u0000'])(
    'refuses %s rather than drawing half a symbol',
    (code) => {
      expect(encode(code)).toBeNull()
    },
  )

  it('refuses an empty code', () => {
    expect(encode('')).toBeNull()
    expect(encode('-')).toBeNull()
  })
})
