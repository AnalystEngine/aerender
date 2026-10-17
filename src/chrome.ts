// Finds a Chrome or Chromium binary: AERENDER_CHROME, then the PATH, then a Playwright-installed Chromium.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const NAMES = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"];
const MAC = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"];

export const CHROME_FIX = 'Install Chrome or Chromium, set AERENDER_CHROME=/path/to/chrome, or run "npx playwright install chromium".';

function onPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const f = path.join(dir, name);
    try { fs.accessSync(f, fs.constants.X_OK); return f; } catch { /* keep looking */ }
  }
  return null;
}

export function findChrome(): { path: string; source: string } | null {
  const env = process.env.AERENDER_CHROME;
  if (env) return fs.existsSync(env) ? { path: env, source: "AERENDER_CHROME" } : null;
  for (const n of NAMES) { const f = onPath(n); if (f) return { path: f, source: "PATH" }; }
  for (const f of MAC) if (fs.existsSync(f)) return { path: f, source: "Applications" };
  try {
    const f = chromium.executablePath();
    if (f && fs.existsSync(f)) return { path: f, source: "Playwright" };
  } catch { /* no Playwright browser installed */ }
  return null;
}

export function chromePath(): string {
  const c = findChrome();
  if (!c) {
    const why = process.env.AERENDER_CHROME ? `AERENDER_CHROME points at a missing file (${process.env.AERENDER_CHROME}). ` : "No Chrome or Chromium found. ";
    throw new Error(why + CHROME_FIX);
  }
  return c.path;
}
