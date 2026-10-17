// Offline fonts (@fontsource) and icons (lucide-static).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const pkgDir = (name: string) => path.dirname(require.resolve(`${name}/package.json`));

const FONTS: Record<string, string> = {
  "Inter Tight": "@fontsource/inter-tight",
  Inter: "@fontsource/inter",
  "JetBrains Mono": "@fontsource/jetbrains-mono",
  "Noto Sans": "@fontsource/noto-sans",
};
export const FALLBACK_STACK = `"Noto Sans", "DejaVu Sans", sans-serif`;

let fontCss: string | null = null;
/** @font-face rules for every bundled family, weights 100-900, normal and italic. */
export function fontFaceCss(): string {
  if (fontCss) return fontCss;
  const out: string[] = [];
  for (const pkg of Object.values(FONTS)) {
    const dir = pkgDir(pkg);
    for (const f of fs.readdirSync(dir)) {
      if (!/^\d00(-italic)?\.css$/.test(f)) continue;
      const css = fs.readFileSync(path.join(dir, f), "utf8");
      out.push(css.replace(/url\(\.\/files\/([^)]+)\)/g, (_, p) => `url(${pathToFileURL(path.join(dir, "files", p)).href})`));
    }
  }
  return (fontCss = out.join("\n"));
}
export const knownFonts = () => Object.keys(FONTS);

const iconDir = () => path.join(pkgDir("lucide-static"), "icons");
let iconNames: string[] | null = null;
export function lucideNames(): string[] {
  return (iconNames ??= fs.readdirSync(iconDir()).filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4)));
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export function closeMatches(name: string, pool: string[], n = 5): string[] {
  const parts = name.split("-");
  return pool
    .map((p) => ({ p, s: lev(name, p) - (p.includes(name) || name.includes(p) ? 3 : 0) - (parts.some((x) => x.length > 2 && p.includes(x)) ? 2 : 0) }))
    .sort((a, b) => a.s - b.s)
    .slice(0, n)
    .map((x) => x.p);
}

export class IconError extends Error {}

/** Inner SVG markup (paths etc.) of a lucide icon. Throws with close matches when unknown. */
export function lucideInner(name: string): string {
  const f = path.join(iconDir(), `${name}.svg`);
  if (!name || !fs.existsSync(f)) {
    throw new IconError(`unknown lucide icon "${name}". Close matches: ${closeMatches(name ?? "", lucideNames()).join(", ")}`);
  }
  const s = fs.readFileSync(f, "utf8");
  return s.slice(s.indexOf(">", s.indexOf("<svg")) + 1, s.lastIndexOf("</svg>")).trim();
}
