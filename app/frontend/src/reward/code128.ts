/**
 * Code 128 for a reward code (F33 R1, R2, R4).
 *
 * Shared rather than a game's: the wheel's result panel and the gift sheet
 * both show codes, so by P05 R4 this cannot live inside either game folder.
 *
 * Written here rather than installed. The frontend has four runtime
 * dependencies and this is a closed, published table of thirty-two symbol
 * patterns — but the real argument is the test: the standard says every
 * symbol is eleven modules in six elements with an even number of bar
 * modules, so a typo in the table below fails the suite instead of failing
 * somebody at a counter. See F33 section 13 for what to do if a real scanner
 * ever disagrees anyway.
 */

/**
 * The 107 symbols, as element widths rather than bit strings: bar, space,
 * bar, space, bar, space, each 1 to 4 modules wide. Widths are how the
 * standard itself prints the table, and a bit string of eleven characters is
 * both harder to proof-read and harder to turn into rectangles.
 *
 * Exported for the invariant test. Nothing else should read it — `encode` is
 * the whole interface — but a table whose correctness is the feature's only
 * real risk is worth letting a test see.
 */
export const SYMBOLS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213',
  '122312', '132212', '221213', '221312', '231212', '112232', '122132',
  '122231', '113222', '123122', '123221', '223211', '221132', '221231',
  '213212', '223112', '312131', '311222', '321122', '321221', '312212',
  '322112', '322211', '212123', '212321', '232121', '111323', '131123',
  '131321', '112313', '132113', '132311', '211313', '231113', '231311',
  '112133', '112331', '132131', '113123', '113321', '133121', '313121',
  '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111',
  '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114',
  '413111', '241112', '134111', '111242', '121142', '121241', '114212',
  '124112', '124211', '411212', '421112', '421211', '212141', '214121',
  '412121', '111143', '111341', '131141', '114113', '114311', '411113',
  '411311', '113141', '114131', '311141', '411131',
  // 103, 104, 105: the three start symbols. 106: stop, the one symbol with
  // seven elements and thirteen modules, because a symbol that ends the
  // code has to end on a bar.
  '211412', '211214', '211232', '2331112',
]

/** Code set B: every printable ASCII character, which covers F13 R18's alphabet. */
const START_B = 104

/**
 * F39 R7. The numeric mode: one symbol per *pair* of digits.
 *
 * This is the whole reason F39 made the codes digits. A twelve-digit card
 * is six symbols here against twelve in code set B, and a barcode a third
 * narrower at the same width has bars a third wider — which is most of the
 * difference between a scanner that reads a phone screen first time and one
 * that has to be waved about.
 */
const START_C = 105

const STOP = 106

/** The lowest and highest character code set B can carry, as its own values. */
const FIRST_PRINTABLE = 32
const LAST_VALUE = 94

/**
 * R7. Ten modules of nothing each side, which is the standard's minimum. A
 * scanner with no quiet zone reads the edge of whatever the barcode is
 * sitting on as a bar and gives up.
 */
export const QUIET_ZONE = 10

/**
 * The check symbol's value, or null for a string code set B cannot carry
 * (F33 R10).
 *
 * Its own function because F33's acceptance criteria name a check symbol
 * computed by hand from the standard, and a test cannot check that through
 * a list of rectangles.
 */
export function checkSymbol(code: string): number | null {
  const values = valuesOf(code)

  if (values === null) {
    return null
  }

  /*
   * The weighted sum the standard defines: the start symbol counts once and
   * each data symbol counts by its position, one-based. Modulo 103 because
   * that is how many symbol values there are before the start symbols.
   */
  let sum = startFor(code)

  values.forEach((value, index) => {
    sum += value * (index + 1)
  })

  return sum % 103
}

/**
 * F39 R7, R8. Which code set this string is encoded in.
 *
 * Digits in an even number go in the numeric mode; everything else goes in
 * code set B exactly as before. An odd run of digits would need a mode
 * switch mid-code to finish, and a format that needs one is a format this
 * does not have — F39 R2 and R3 are both even.
 */
function startFor(code: string): number {
  return isNumeric(bare(code)) ? START_C : START_B
}

function isNumeric(characters: string): boolean {
  return 0 === characters.length % 2 && /^[0-9]+$/.test(characters)
}

/** The code without the grouping, which is for eyes and not for scanners. */
function bare(code: string): string {
  return code.replaceAll('-', '').replaceAll(' ', '')
}

/**
 * A code as the element widths of a complete symbol — bar first, then
 * alternating — or null if it cannot be encoded (F33 R10).
 *
 * Null rather than a thrown error or an empty list: the caller's question is
 * "is there a barcode to draw here", and a win from before F16 has no code
 * at all (F33 R14). A partial symbol is the one answer that must never come
 * back, because a scanner that reads half a code reads a different code.
 */
export function encode(code: string): readonly number[] | null {
  const values = valuesOf(code)
  const check = checkSymbol(code)

  if (values === null || check === null) {
    return null
  }

  return [startFor(code), ...values, check, STOP].flatMap((symbol) =>
    [...SYMBOLS[symbol]].map(Number),
  )
}

/**
 * The code's symbol values, in whichever code set it belongs to, or null if
 * it belongs to neither.
 *
 * The grouping goes first (F33 R2, F39 R4). It is for human eyes — so a code
 * can be read aloud — and the server treats it as noise too, so a scanned
 * code and a typed code arrive at the same string either way. Encoding it
 * would only make the barcode wider.
 */
function valuesOf(code: string): number[] | null {
  const characters = bare(code)

  if (0 === characters.length) {
    return null
  }

  return isNumeric(characters) ? numericValues(characters) : printableValues(characters)
}

/** F39 R7. Each pair of digits as the number it spells: "48" is 48. */
function numericValues(digits: string): number[] {
  const values: number[] = []

  for (let at = 0; at < digits.length; at += 2) {
    values.push(Number(digits.slice(at, at + 2)))
  }

  return values
}

function printableValues(characters: string): number[] | null {
  const values = [...characters].map(
    (character) => (character.codePointAt(0) ?? 0) - FIRST_PRINTABLE,
  )

  return values.every((value) => value >= 0 && value <= LAST_VALUE) ? values : null
}
