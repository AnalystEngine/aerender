// One Chrome launch per command. Renders compiled HTML to PNG/PDF and measures the DOM for lint.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, Browser, Page } from "playwright-core";
import { chromePath } from "./chrome.js";

export type Loader = (html: string, scale: number, opts?: { file?: string; prepare?: boolean }) => Promise<Page>;

/** Launch Chrome once; `load` opens compiled HTML in a fresh page, laid out and ready to capture. */
export async function withBrowser<T>(fn: (load: Loader) => Promise<T>): Promise<T> {
  const tmps: string[] = [];
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ executablePath: chromePath(), args: ["--no-sandbox", "--font-render-hinting=none", "--allow-file-access-from-files"] });
    const load: Loader = async (html, scale, opts = {}) => {
      const file = opts.file ?? path.join(os.tmpdir(), `aerender-${process.pid}-${Date.now()}-${tmps.length}.html`);
      if (!opts.file) tmps.push(file);
      fs.writeFileSync(file, html);
      const ctx = await browser!.newContext({ deviceScaleFactor: scale, viewport: { width: 1600, height: 1000 } });
      const page = await ctx.newPage();
      page.on("requestfailed", (r) => console.error(`warn: could not load ${r.url().slice(0, 120)} (${r.failure()?.errorText}); download it with "aerender asset add" instead`));
      page.on("response", (r) => { if (r.status() >= 400) console.error(`warn: ${r.url().slice(0, 120)} returned HTTP ${r.status()}`); });
      await page.addInitScript("window.__name = (f) => f");
      await page.goto("file://" + file, { waitUntil: "load" });
      if (opts.prepare !== false) await prepare(page);
      const size = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
      await page.setViewportSize({ width: Math.min(Math.max(size.w, 100), 8000), height: Math.min(Math.max(size.h, 100), 16000) });
      return page;
    };
    return await fn(load);
  } finally {
    await browser?.close();
    for (const t of tmps) fs.rmSync(t, { force: true });
  }
}

export async function withPage<T>(html: string, scale: number, fn: (page: Page) => Promise<T>): Promise<T> {
  return withBrowser(async (load) => fn(await load(html, scale)));
}

async function prepare(page: Page) {
  await page.evaluate(async () => {
    await (document as any).fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    // CSS background images are not in document.images; load each once so screenshots never catch them half-drawn.
    const urls = new Set<string>();
    for (const el of document.querySelectorAll<HTMLElement>("[style*='url(']")) for (const m of getComputedStyle(el).backgroundImage.matchAll(/url\("([^"]+)"\)/g)) urls.add(m[1]);
    await Promise.all([...urls].map((u) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = u; })));
    // Text boxes round up to whole pixels so stacked layouts land on whole-pixel positions.
    const texts = [...document.querySelectorAll<HTMLElement>('[data-t="text"]:not([data-growth="fixed-width-height"])')];
    const hs = texts.map((t) => t.getBoundingClientRect().height);
    texts.forEach((t, i) => { if (hs[i] % 1) t.style.height = Math.ceil(hs[i]) + "px"; });
    (window as any).__aeDraw?.();
    for (const s of document.querySelectorAll<HTMLElement>(".ae-slot")) {
      const r = (s.firstElementChild as HTMLElement | null)?.getBoundingClientRect();
      if (r) { s.style.height = Math.ceil(r.height) + "px"; s.style.width = Math.ceil(r.width) + "px"; }
    }
  });
}

export async function screenshotNodes(page: Page, uids: string[], outFiles: string[]) {
  for (let i = 0; i < uids.length; i++) {
    const box = await page.locator(`[data-uid="${uids[i]}"]`).first().boundingBox();
    if (!box) throw new Error(`node ${uids[i]} has no visible box`);
    const x = Math.round(box.x), y = Math.round(box.y);
    const clip = { x, y, width: Math.max(1, Math.round(box.x + box.width) - x), height: Math.max(1, Math.round(box.y + box.height) - y) };
    await page.screenshot({ path: outFiles[i], omitBackground: true, clip, fullPage: true });
  }
}

export async function pdf(page: Page, out: string) {
  await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
}

export const cssEsc = (s: string) => s.replace(/["\\]/g, "\\$&");
