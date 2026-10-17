// Discovers brand folders: each AERENDER_BRANDS entry in order, then the package's brands/.
import fs from "node:fs";
import path from "node:path";
import { PKG_ROOT, LIB_ALIAS, LIB_EXT } from "./doc.js";

export const BUILT_IN = "built-in";
const ID = /^[a-z0-9][a-z0-9-]*$/;

export interface Brand {
  id: string;
  dir: string;
  /** "built-in", or the AERENDER_BRANDS directory the brand came from. */
  source: string;
  name: string;
  description: string;
  warnings: string[];
}

export interface Discovery {
  brands: Brand[];
  /** Brands hidden by an earlier source with the same id. */
  shadowed: Brand[];
  /** Folders skipped because their name is not a valid brand id. */
  skipped: string[];
}

/** Expand `${VAR}` and `$VAR`; an entry that names an unset or empty variable is dropped. */
function expand(entry: string): string | undefined {
  let missing = false;
  const out = entry.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, a, b) => {
    const v = process.env[a ?? b];
    if (!v) missing = true;
    return v ?? "";
  });
  return missing ? undefined : out;
}

const isDir = (p: string) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

/** Expand `*` in any path segment to the matching directories, sorted. */
function glob(p: string): string[] {
  const abs = path.resolve(p);
  if (!abs.includes("*")) return isDir(abs) ? [abs] : [];
  const parts = abs.split(path.sep);
  let dirs = [parts[0] || path.sep];
  for (const seg of parts.slice(1)) {
    if (!seg) continue;
    if (!seg.includes("*")) { dirs = dirs.map((d) => path.join(d, seg)).filter(isDir); continue; }
    const re = new RegExp("^" + seg.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
    dirs = dirs.flatMap((d) => {
      try { return fs.readdirSync(d).filter((f) => re.test(f) && !f.startsWith(".")).sort().map((f) => path.join(d, f)).filter(isDir); } catch { return []; }
    });
  }
  return dirs;
}

/** The directories searched for brand folders, in order. */
export function brandSources(): { dir: string; source: string }[] {
  const out: { dir: string; source: string }[] = [];
  for (const entry of (process.env.AERENDER_BRANDS ?? "").split(":")) {
    const e = entry.trim() && expand(entry.trim());
    if (e) for (const dir of glob(e)) out.push({ dir, source: dir });
  }
  out.push({ dir: path.join(PKG_ROOT, "brands"), source: BUILT_IN });
  return out;
}

/** Read GUIDE.md's title and first paragraph, and note any breach of the folder contract. */
function describe(id: string, dir: string, source: string): Brand {
  const b: Brand = { id, dir, source, name: id, description: "", warnings: [] };
  const guide = path.join(dir, "GUIDE.md");
  if (fs.existsSync(guide)) {
    const lines = fs.readFileSync(guide, "utf8").split(/\r?\n/);
    if (/^# \S/.test(lines[0] ?? "")) b.name = lines[0].slice(2).trim();
    else b.warnings.push(`${guide}: the first line must be "# <Display name>"`);
    const rest = lines.slice(1);
    const start = rest.findIndex((l) => l.trim());
    if (start >= 0) {
      const end = rest.findIndex((l, i) => i > start && !l.trim());
      b.description = rest.slice(start, end < 0 ? undefined : end).map((l) => l.trim()).join(" ");
    }
  } else b.warnings.push(`brand "${id}" has no GUIDE.md (${dir})`);
  if (!fs.existsSync(path.join(dir, `tokens${LIB_EXT}`))) {
    b.warnings.push(`brand "${id}" has no tokens.lib.json; generate it with: aerender tokens import tokens.css --out tokens.lib.json`);
  }
  return b;
}

let cache: { key: string; result: Discovery } | undefined;

export function discoverBrands(): Discovery {
  const key = process.env.AERENDER_BRANDS ?? "";
  if (cache?.key === key) return cache.result;
  const result: Discovery = { brands: [], shadowed: [], skipped: [] };
  const seen = new Set<string>();
  for (const { dir, source } of brandSources()) {
    let names: string[];
    try { names = fs.readdirSync(dir).sort(); } catch { continue; }
    for (const name of names) {
      if (name.startsWith("_") || name.startsWith(".") || !isDir(path.join(dir, name))) continue;
      if (!ID.test(name)) { result.skipped.push(path.join(dir, name)); continue; }
      const b = describe(name, path.join(dir, name), source);
      (seen.has(name) ? result.shadowed : result.brands).push(b);
      seen.add(name);
    }
  }
  cache = { key, result };
  return result;
}

/** Find a brand by id, accepting `aerender:<id>`; unknown ids fail with the list of brands. */
export function findBrand(ref: string): Brand {
  const id = ref.startsWith(LIB_ALIAS) ? ref.slice(LIB_ALIAS.length) : ref;
  const { brands } = discoverBrands();
  const b = brands.find((x) => x.id === id);
  if (!b) throw new Error(`no brand "${id}". Available: ${brands.map((x) => x.id).join(", ") || "none"}. Run: aerender brands`);
  return b;
}

/** Every library of every discovered brand, e.g. "aerender:analystengine/ui". */
export function brandLibraries(): { alias: string; file: string; brand: Brand }[] {
  return discoverBrands().brands.flatMap((brand) =>
    fs.readdirSync(brand.dir).filter((f) => f.endsWith(LIB_EXT)).sort()
      .map((f) => ({ alias: `${LIB_ALIAS}${brand.id}/${f.slice(0, -LIB_EXT.length)}`, file: path.join(brand.dir, f), brand })));
}

/** Resolve "aerender:<brand>/<path>" to a file inside that brand's folder. */
export function brandFile(alias: string): string {
  const rest = alias.slice(LIB_ALIAS.length);
  const slash = rest.indexOf("/");
  if (slash < 1) throw new Error(`"${alias}" must look like aerender:<brand>/<file>`);
  const b = findBrand(rest.slice(0, slash));
  const f = path.resolve(b.dir, rest.slice(slash + 1));
  if (!f.startsWith(b.dir + path.sep)) throw new Error(`"${alias}" points outside the brand folder`);
  return f;
}
