/**
 * Slice colours, mirroring the backend's SlicePalette.
 *
 * The API sends a colour with every saved prize, but the preview has to
 * colour prizes the admin has only just added, which the server has never
 * seen. Rather than leave those uncoloured until a save, the list lives here
 * too. An end-to-end test asserts the two agree, so drift fails the build.
 *
 * Every colour clears WCAG AA (4.5:1) against white label text.
 */
export const SLICE_COLOURS = [
  '#475569', // slate 600
  '#E11D48', // rose 600
  '#0369A1', // sky 700
  '#B45309', // amber 700
  '#047857', // emerald 700
  '#7C3AED', // violet 600
  '#C2410C', // orange 700
  '#0F766E', // teal 700
  '#C026D3', // fuchsia 600
  '#4D7C0F', // lime 700
  '#0E7490', // cyan 700
  '#4F46E5', // indigo 600
] as const

export function colourFor(position: number): string {
  const count = SLICE_COLOURS.length

  return SLICE_COLOURS[((position % count) + count) % count]
}
