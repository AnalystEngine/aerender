// Converts CSS custom properties (tokens.css) into a variables library.
import fs from "node:fs";

function rootDecls(css: string): Record<string, string> {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Record<string, string> = {};
  for (const block of css.matchAll(/:root\s*\{([\s\S]*?)\}/g)) {
    for (const m of block[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  }
  return out;
}

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, "0").toUpperCase();
function rgbaHex(s: string): string | null {
  const m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (!m) return null;
  return "#" + hex2(+m[1]) + hex2(+m[2]) + hex2(+m[3]) + (m[4] !== undefined && +m[4] < 1 ? hex2(+m[4] * 255) : "");
}

function splitTop(s: string): string[] {
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

export function tokensImport(src: string, out: string, viewport = 1440): string {
  if (!out || !out.endsWith(".lib.json")) throw new Error("--out <name.lib.json> is required");
  const raw = rootDecls(fs.readFileSync(src, "utf8"));
  const resolve = (name: string, seen: string[] = []): string => {
    if (seen.includes(name)) throw new Error(`var() cycle at --${name}`);
    return (raw[name] ?? "").replace(/var\(--([\w-]+)\)/g, (_, r) => resolve(r, [...seen, name]));
  };
  const vars: Record<string, { type: string; value: any }> = {};
  const notes: string[] = [];
  for (const name of Object.keys(raw)) {
    const alias = raw[name].match(/^var\(--([\w-]+)\)$/);
    const val = resolve(name);
    const a = alias ? `$${alias[1]}` : null;
    let m: RegExpMatchArray | null;
    if (/^#[0-9a-f]{3,8}$/i.test(val)) vars[name] = { type: "color", value: a ?? val.toUpperCase() };
    else if (rgbaHex(val)) vars[name] = { type: "color", value: a ?? rgbaHex(val) };
    else if ((m = val.match(/^clamp\(\s*([\d.]+)px\s*,\s*([\d.]+)vw\s*,\s*([\d.]+)px\s*\)$/))) {
      const px = Math.round(Math.min(Math.max((+m[2] * viewport) / 100, +m[1]), +m[3]));
      vars[name] = { type: "number", value: px };
      notes.push(`--${name}: ${val} evaluated at ${viewport}px = ${px}`);
    } else if ((m = val.match(/^(-?[\d.]+)px$/))) vars[name] = { type: "number", value: a ?? +m[1] };
    else if (/^-?[\d.]+$/.test(val)) vars[name] = { type: "number", value: a ?? +val };
    else if (/^-?[\d.]+em$/.test(val)) vars[name] = { type: "string", value: a ?? val };
    else if (/font/.test(name)) vars[name] = { type: "string", value: val.replace(/'/g, "") };
    else if (/^(shadow|glow)|-(shadow|glow)/.test(name) || /\binset\b|rgba\(/.test(val)) {
      // No effect variable type: store each layer as -x/-y/-blur/-spread/-color parts.
      let outer = 0;
      splitTop(val).forEach((layer) => {
        const inset = /\binset\b/.test(layer);
        const i = inset ? 0 : outer++;
        const colour = layer.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/i)?.[0] ?? "#000000";
        const nums = layer.replace(colour, "").replace("inset", "").trim().split(/\s+/).map((x) => parseFloat(x) || 0);
        const base = `${name}-${inset ? "inner" : i === 0 ? "outer" : `outer-${i + 1}`}`;
        const [x = 0, y = 0, blur = 0, spread = 0] = nums;
        Object.assign(vars, {
          [`${base}-x`]: { type: "number", value: x }, [`${base}-y`]: { type: "number", value: y },
          [`${base}-blur`]: { type: "number", value: blur }, [`${base}-spread`]: { type: "number", value: spread },
          [`${base}-color`]: { type: "color", value: rgbaHex(colour) ?? colour.toUpperCase() },
        });
      });
      notes.push(`--${name}: split into ${name}-{inner,outer}-{x,y,blur,spread,color}`);
    } else notes.push(`--${name}: "${val}" skipped (no static equivalent)`);
  }
  const doc = { aerender: 1, variables: vars, children: [] };
  fs.writeFileSync(out, JSON.stringify(doc, null, 2) + "\n");
  return [`${out}: ${Object.keys(vars).length} variables from ${Object.keys(raw).length} custom properties`, ...notes].join("\n");
}
