import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SLICE_COLOURS, colourFor } from './palette'
import { WheelPreview, type PreviewSlice } from './WheelPreview'

function slices(...names: string[]): PreviewSlice[] {
  return names.map((name, index) => ({ key: `k${index}`, name, probability: 10 }))
}

describe('WheelPreview', () => {
  it('draws one slice per prize', () => {
    render(<WheelPreview slices={slices('A', 'B', 'C')} />)

    expect(screen.getAllByTestId('wheel-slice')).toHaveLength(3)
  })

  /**
   * F01 R13. Slice size carries no information about the odds — that is the
   * admin's deliberate choice — so every wedge must be identical.
   */
  it('draws every slice the same size', () => {
    const { container } = render(<WheelPreview slices={slices('A', 'B', 'C', 'D')} />)

    const paths = Array.from(container.querySelectorAll('path')).map((path) =>
      path.getAttribute('d'),
    )

    // Each path is the same wedge rotated, so the arc radius and the sweep
    // flag must be identical across all of them.
    const arcs = paths.map((d) => d?.match(/A 94 94 0 (\d) 1/)?.[1])

    expect(new Set(arcs).size).toBe(1)
    expect(paths).toHaveLength(4)
  })

  it('uses the palette colour for each position', () => {
    render(<WheelPreview slices={slices('A', 'B', 'C')} />)

    const rendered = screen.getAllByTestId('wheel-slice').map((g) => g.dataset.colour)

    expect(rendered).toEqual([colourFor(0), colourFor(1), colourFor(2)])
  })

  it('gives neighbouring slices different colours', () => {
    render(<WheelPreview slices={slices(...Array.from({ length: 12 }, (_, i) => `P${i}`))} />)

    const colours = screen.getAllByTestId('wheel-slice').map((g) => g.dataset.colour)

    expect(new Set(colours).size).toBe(12)
  })

  it('shows prize names', () => {
    render(<WheelPreview slices={slices('Free gift', 'Try again')} />)

    // Scoped to the visible label: the <title> carries the same text for
    // assistive technology, so an unscoped query matches twice.
    expect(screen.getByText('Free gift', { selector: 'tspan' })).toBeInTheDocument()
    expect(screen.getByText('Try again', { selector: 'tspan' })).toBeInTheDocument()
  })

  it('shortens a long name but keeps the full text available', () => {
    const long = 'An extremely long prize name that will not fit'
    const { container } = render(
      <WheelPreview slices={[{ key: 'k', name: long, probability: 100 }]} />,
    )

    expect(screen.queryByText(long, { selector: 'tspan' })).not.toBeInTheDocument()
    expect(screen.getByText(/…$/, { selector: 'tspan' })).toBeInTheDocument()

    // Queried directly: getByTitle only matches a <title> that is a direct
    // child of the <svg>, and this one correctly sits inside its <text>.
    expect(container.querySelector('text > title')?.textContent).toBe(long)
  })

  it('puts the full name and odds in the accessible title', () => {
    const { container } = render(
      <WheelPreview slices={[{ key: 'k', name: 'Free gift', probability: 42 }]} showOdds />,
    )

    expect(container.querySelector('text > title')?.textContent).toBe('Free gift — 42%')
  })

  it('shows the odds only when asked', () => {
    const { rerender } = render(
      <WheelPreview slices={[{ key: 'k', name: 'A', probability: 42 }]} />,
    )

    expect(screen.queryByText('42%', { selector: 'tspan' })).not.toBeInTheDocument()

    rerender(<WheelPreview slices={[{ key: 'k', name: 'A', probability: 42 }]} showOdds />)

    expect(screen.getByText('42%', { selector: 'tspan' })).toBeInTheDocument()
  })

  it('omits the percentage while a probability is unreadable', () => {
    render(<WheelPreview slices={[{ key: 'k', name: 'A', probability: null }]} showOdds />)

    expect(screen.queryByText(/%/, { selector: 'tspan' })).not.toBeInTheDocument()
    expect(screen.getByText('A', { selector: 'tspan' })).toBeInTheDocument()
  })

  /** F01 R16 — React escapes by default; this guards against a future dangerouslySetInnerHTML. */
  it('renders a name containing markup as text', () => {
    const { container } = render(
      <WheelPreview slices={[{ key: 'k', name: '<b>bold</b>', probability: 100 }]} />,
    )

    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByText('<b>bold</b>', { selector: 'tspan' })).toBeInTheDocument()
  })

  it('labels an unnamed slice rather than drawing nothing', () => {
    render(<WheelPreview slices={[{ key: 'k', name: '   ', probability: 100 }]} />)

    expect(screen.getByText('Unnamed', { selector: 'tspan' })).toBeInTheDocument()
  })

  it('handles a single slice without collapsing the path', () => {
    const { container } = render(
      <WheelPreview slices={[{ key: 'k', name: 'Everyone wins', probability: 100 }]} />,
    )

    const path = container.querySelector('path')?.getAttribute('d') ?? ''

    expect(path).toContain('A 94 94 0 1 1')
  })

  it('shows a placeholder when there are no prizes', () => {
    render(<WheelPreview slices={[]} />)

    expect(screen.getByRole('img', { name: /empty wheel/i })).toBeInTheDocument()
    expect(screen.queryByTestId('wheel-preview')).not.toBeInTheDocument()
  })

  it('describes itself for assistive technology', () => {
    render(<WheelPreview slices={slices('A', 'B')} />)

    expect(screen.getByRole('img', { name: 'Wheel with 2 slices' })).toBeInTheDocument()
  })
})

describe('palette', () => {
  it('wraps beyond the end of the list', () => {
    expect(colourFor(SLICE_COLOURS.length)).toBe(colourFor(0))
  })

  it('handles a negative position', () => {
    expect(colourFor(-1)).toMatch(/^#[0-9A-F]{6}$/)
  })
})
