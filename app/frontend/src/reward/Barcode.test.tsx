import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Barcode } from './Barcode'
import { QUIET_ZONE } from './code128'

/** F33 R5 to R10. */
describe('a reward code as a barcode', () => {
  it('draws the code as bars', () => {
    render(<Barcode code="M9PX-K4T7" />)

    const svg = screen.getByRole('img')

    // 143 modules (123 and two quiet zones), stretched to the given height.
    expect(svg).toHaveAttribute('viewBox', '0 0 143 10')
    expect(svg).toHaveAttribute('preserveAspectRatio', 'none')
    /*
     * Thirty-four bars: ten symbols of six elements and the stop's seven is
     * sixty-seven, and a bar is every other one of them starting with the
     * first.
     */
    expect(svg.querySelectorAll('rect[fill="#000000"]')).toHaveLength(34)
  })

  /** R9. A code read aloud by a screen reader, not "image". */
  it('is named by the code it carries', () => {
    render(<Barcode code="M9PX-K4T7" />)

    expect(screen.getByRole('img')).toHaveAccessibleName('M9PX-K4T7')
  })

  /** R6. Every theme is dark; a scanner wants ink on paper. */
  it('is black on white whatever is behind it', () => {
    render(<Barcode code="M9PX-K4T7" />)

    const svg = screen.getByRole('img')
    const tile = svg.querySelector('rect')

    expect(tile).toHaveAttribute('fill', '#ffffff')
    expect(screen.getByTestId('reward-barcode').className).toContain('bg-white')
  })

  /** R7. Without it the scanner reads the edge of the tile as a bar. */
  it('leaves ten modules of quiet each side', () => {
    render(<Barcode code="M9PX-K4T7" />)

    const bars = [...screen.getByRole('img').querySelectorAll('rect[fill="#000000"]')]
    const first = bars.at(0)
    const last = bars.at(-1)

    expect(first).toHaveAttribute('x', String(QUIET_ZONE))
    expect(
      Number(last?.getAttribute('x')) + Number(last?.getAttribute('width')),
    ).toBe(143 - QUIET_ZONE)
  })

  /** R10. Half a symbol is a different code. */
  it('draws nothing it cannot draw correctly', () => {
    render(<Barcode code="M9PX-K4T€" />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reward-barcode')).not.toBeInTheDocument()
  })
})
