import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library does not unmount automatically outside of its own runner,
// so without this a component from one test can still be in the DOM during
// the next, and queries start matching the wrong element.
afterEach(() => {
  cleanup()
})
