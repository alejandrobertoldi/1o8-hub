import { vi } from "vitest";
import '@testing-library/jest-dom/vitest'
import { config } from 'dotenv'
import { resolve } from 'path'

// Tests that need DATABASE_URL (e.g. tests/db/*) load it from .env.local.
// Worktrees should symlink .env.local from the main checkout.
config({ path: resolve(process.cwd(), '.env.local') })


// next/font only runs inside the Next build. Any Google font a component loads at
// module level (e.g. the flap-clock Oswald) becomes a stub with a className, so
// tests that import such components still load. A test can vi.mock it itself.
vi.mock("next/font/google", () => {
  const font = () => ({ className: "", style: {} });
  // `has` too: vitest checks the export exists before reading it.
  return new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : font), has: () => true });
});
