#!/usr/bin/env node
// aerender: agent-facing CLI to edit, check and render scene files.
import fs from "node:fs";
import path from "node:path";
import { load, buildScene } from "./doc.js";
import { expandAll, Problems, RNode } from "./resolve.js";
import { Compiler } from "./compile.js";
import { withBrowser, screenshotNodes, pdf } from "./browser.js";
import { selectNodes, slug } from "./address.js";
import { runEdit, runBatch } from "./edit.js";
import { tree } from "./tree.js";
import { validate } from "./validate.js";
import { lint } from "./lint.js";
import { tokensImport } from "./tokens.js";
import { exportHtml, exportSpec } from "./export.js";
import { assetAdd } from "./asset.js";
import { doctor } from "./doctor.js";
import { PKG_ROOT } from "./doc.js";
import { BUILT_IN, Brand, brandLibraries, discoverBrands, findBrand } from "./brands.js";

const VERSION: string = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "package.json"), "utf8")).version;

interface Args { _: string[]; flags: Record<string, string[]> }
function parseArgs(argv: string[]): Args {
  const a: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (s.startsWith("--")) {
      const [k, v] = s.slice(2).split("=", 2);
      const val = v ?? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true");
      (a.flags[k] ??= []).push(val);
    } else a._.push(s);
  }
  return a;
}
const flag = (a: Args, k: string) => a.flags[k]?.[a.flags[k].length - 1];

function printProblems(p: Problems, quiet = false) {
  for (const x of p.list) if (!quiet || x.level === "error") console.error(`${x.level}: ${x.msg}${x.node ? ` [${x.node}]` : ""}`);
}

const USAGE = `aerender <command> ...
  --version | doctor | libs
  brands [--json]
  brand <id> [--components | --path]
  render <file> [--node X]... [--out dir] [--scale 2] [--format png|pdf] [--deck]
  tree <file> [--node X] [--depth N] [--all] [--ids]
  get <file> <path>
  set <file> <path> key=value ...
  insert <file> <parent> '<json>' [--index n]
  delete <file> <path>
  move <file> <path> <new-parent> [--index n]
  copy <file> <path> <new-parent> [--name X] [--index n]
  batch <file> <ops.json | ->
  validate <file>
  lint <file> [--node X] [--brand <id> | tokens.css]
  asset add <url-or-path> [--scene file.scene.json] [--name x] [--credit text]
  tokens import <tokens.css> --out <name.lib.json>
  export html <file> --node X --out f.html
  export spec <file> --node X [--format json|md]`;

const isSlide = (r: RNode) => r.slide === true || (typeof r.width === "number" && typeof r.height === "number" && Math.abs(r.width / r.height - 16 / 9) < 0.01);

/** Slides are top-level frames or instances marked `slide: true` or sized 16:9; components count only in a library. */
function deckSlides(roots: RNode[]): RNode[] {
  const s = roots.filter((r) => isSlide(r) && r.enabled !== false);
  const placed = s.filter((r) => !r.reusable);
  return placed.length ? placed : s;
}

function deckHtml(title: string, slides: { label: string; png: string }[]): string {
  const rows = slides.map((s, i) => `${i ? '<hr>' : ""}<section><div class="label">${s.label.replace(/</g, "&lt;")}</div><img src="${s.png}" alt="${s.label.replace(/"/g, "&quot;")}"></section>`).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
body { margin: 0; padding: 40px 64px 64px; background: #3a3a3a; color: #d8d8d8; font: 500 18px "Inter Tight", Inter, system-ui, sans-serif; }
h1 { font-size: 20px; font-weight: 600; margin: 0 0 32px; color: #f0f0f0; }
section { max-width: 1920px; }
.label { margin: 0 0 12px; letter-spacing: 0.08em; text-transform: uppercase; font-size: 16px; color: #cfcfcf; }
img { display: block; width: 1920px; max-width: 100%; aspect-ratio: 16 / 9; box-shadow: 0 6px 24px rgba(0,0,0,0.35); }
hr { max-width: 1920px; border: 0; border-top: 1px solid #5a5a5a; margin: 48px 0; }
</style></head><body><h1>${title}</h1>
${rows}
</body></html>`;
}

async function render(a: Args) {
  const file = a._[1];
  const doc = load(file);
  const sc = buildScene(doc);
  const probs = new Problems();
  const roots = expandAll(sc, probs);
  const deck = !!flag(a, "deck");
  const targets: RNode[] = a.flags.node ? a.flags.node.flatMap((q) => selectNodes(roots, q))
    : deck ? deckSlides(roots) : roots.filter((r) => r.type === "frame" || r.type === "ref");
  if (!targets.length) throw new Error(deck ? "no slides found: give top-level frames a 16:9 size or slide: true" : "nothing to render");
  const format = flag(a, "format") ?? "png";
  const scale = +(flag(a, "scale") ?? 2);
  const base = slug(path.basename(file).replace(/\.(scene|lib)\.json$/, ""));
  const out = path.resolve(flag(a, "out") ?? path.join(path.dirname(path.resolve(file)), "renders"));
  const comp = new Compiler(sc, probs);
  const html = comp.document(targets, { pdf: format === "pdf" && !deck });
  const pdfHtml = deck ? new Compiler(sc, new Problems()).document(targets, { pdf: true }) : "";
  printProblems(probs);
  if (probs.list.some((x) => x.level === "error") && !flag(a, "force")) {
    console.error("render stopped: fix the errors above (or pass --force)");
    process.exit(1);
  }
  fs.mkdirSync(out, { recursive: true });
  if (flag(a, "html")) fs.writeFileSync(path.join(out, "debug.html"), html);
  await withBrowser(async (loadPage) => {
    if (format === "pdf" && !deck) {
      const f = path.join(out, `${base}.pdf`);
      await pdf(await loadPage(html, 1), f);
      console.log(f);
      return;
    }
    const used = new Set<string>();
    const files = targets.map((t, i) => {
      let name = (deck ? `${String(i + 1).padStart(2, "0")}-` : "") + slug(t.name ?? t.id);
      while (used.has(name)) name += "-" + t.id;
      used.add(name);
      return path.join(out, `${name}${scale === 1 ? "" : `@${scale}x`}.png`);
    });
    await screenshotNodes(await loadPage(html, scale), targets.map((t) => String(t._m.uid)), files);
    files.forEach((f) => console.log(f));
    if (!deck) return;
    const f = path.join(out, `${base}.pdf`);
    await pdf(await loadPage(pdfHtml, 1), f);
    console.log(f);
    const page = path.join(out, "deck.html");
    const items = targets.map((t, i) => ({ label: `${String(i + 1).padStart(2, "0")} · ${t.name ?? t.id}`, png: path.basename(files[i]) }));
    fs.writeFileSync(page, deckHtml(`${path.basename(file)} · ${targets.length} slides`, items));
    console.log(page);
    const deckScale = +(flag(a, "deck-scale") ?? 1);
    const p = await loadPage(fs.readFileSync(page, "utf8"), deckScale, { file: page, prepare: false });
    await p.setViewportSize({ width: 2048, height: 1200 });
    await p.evaluate(async () => { await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))); });
    const png = path.join(out, "deck.png");
    await p.screenshot({ path: png, fullPage: true });
    console.log(png);
  });
}

const warnBrand = (b: Brand) => b.warnings.forEach((w) => console.error(`warning: ${w}`));

function brands(a: Args) {
  const d = discoverBrands();
  if (flag(a, "json")) {
    const row = (b: Brand) => ({ id: b.id, name: b.name, description: b.description, source: b.source, path: b.dir, warnings: b.warnings });
    return console.log(JSON.stringify({ brands: d.brands.map(row), shadowed: d.shadowed.map(row), skipped: d.skipped }, null, 2));
  }
  const w = Math.max(...d.brands.map((b) => b.id.length), 2);
  const n = Math.max(...d.brands.map((b) => b.name.length), 4);
  for (const b of d.brands) console.log(`${b.id.padEnd(w)}  ${b.name.padEnd(n)}  ${b.description || "(no description)"}  [${b.source}]`);
  for (const b of d.shadowed) {
    const winner = d.brands.find((x) => x.id === b.id)!;
    console.log(`note: ${b.id} in ${b.source} is shadowed by ${winner.source === BUILT_IN ? "the built-in brand" : winner.source}`);
  }
  for (const f of d.skipped) console.error(`warning: ${f} skipped: a brand folder name uses lowercase letters, digits and hyphens`);
  [...d.brands, ...d.shadowed].forEach(warnBrand);
  console.log("Read a brand's guide: aerender brand <id>");
}

function brand(a: Args) {
  if (!a._[1]) throw new Error("usage: brand <id> [--components | --path]. List brands with: aerender brands");
  const b = findBrand(a._[1]);
  warnBrand(b);
  for (const s of discoverBrands().shadowed.filter((x) => x.id === b.id)) console.error(`note: this brand shadows ${s.dir}`);
  if (flag(a, "path")) return console.log(b.dir);
  const file = path.join(b.dir, flag(a, "components") ? "components.md" : "GUIDE.md");
  if (!fs.existsSync(file)) {
    if (flag(a, "components")) throw new Error(`brand "${b.id}" has no components.md. List its components with: aerender tree aerender:${b.id}/<library> --depth 1`);
    return;
  }
  process.stdout.write(fs.readFileSync(file, "utf8"));
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const cmd = a._[0];
  if (cmd === "--version" || cmd === "-v" || cmd === "version" || (!cmd && flag(a, "version"))) return console.log(VERSION);
  if (cmd === "doctor") {
    const r = await doctor(VERSION);
    console.log(r.text);
    process.exit(r.ok ? 0 : 1);
  }
  if (cmd && (flag(a, "help") || a._.includes("-h"))) {
    const lines = USAGE.split("\n").filter((l) => l.trim().startsWith(cmd + " ") || l.trim() === cmd);
    console.log(lines.length ? lines.map((l) => "aerender " + l.trim()).join("\n") + "\nSee SKILL.md for details." : USAGE);
    return;
  }
  const needsFile = ["render", "tree", "get", "set", "insert", "delete", "move", "copy", "batch", "validate", "lint"];
  if (needsFile.includes(cmd) && !a._[1]) { console.error(`error: ${cmd} needs a .scene.json or .lib.json file. Try: aerender ${cmd} --help`); process.exit(1); }
  try {
    switch (cmd) {
      case "render": return await render(a);
      case "tree": return console.log(tree(a._[1], { node: flag(a, "node"), depth: flag(a, "depth") ? +flag(a, "depth")! : undefined, all: !!flag(a, "all"), ids: !!flag(a, "ids") }));
      case "get": case "set": case "insert": case "delete": case "move": case "copy":
        return console.log(runEdit(cmd, a._.slice(1), { index: flag(a, "index"), name: flag(a, "name") }));
      case "batch": return console.log(runBatch(a._[1], a._[2]));
      case "validate": {
        const r = validate(a._[1]);
        console.log(r.text);
        process.exit(r.ok ? 0 : 1);
      }
      case "lint": {
        const r = await lint(a._[1], { nodes: a.flags.node, brand: flag(a, "brand") });
        console.log(r.text);
        process.exit(r.ok ? 0 : 1);
      }
      case "brands": return brands(a);
      case "brand": return brand(a);
      case "libs": {
        const lines = brandLibraries().map((l) => {
          const raw = JSON.parse(fs.readFileSync(l.file, "utf8"));
          let comps = 0;
          const walk = (n: any) => { if (n.reusable) comps++; (n.children ?? []).forEach(walk); };
          (raw.children ?? []).forEach(walk);
          const imports = Object.entries<string>(raw.imports ?? {}).map(([k, v]) => `${k}=${v}`).join(" ");
          return `${l.alias}  ${Object.keys(raw.variables ?? {}).length} variables, ${comps} components${imports ? `, imports ${imports}` : ""}`;
        });
        return console.log(lines.join("\n") + "\nList components with ids: aerender tree aerender:<brand>/<library> --depth 1");
      }
      case "asset":
        if (a._[1] !== "add") throw new Error("usage: asset add <url-or-path> [--scene file.scene.json] [--name x] [--credit text]");
        return console.log(await assetAdd(a._[2], { deck: flag(a, "scene") ?? flag(a, "deck"), name: flag(a, "name"), credit: flag(a, "credit") }));
      case "tokens":
        if (a._[1] !== "import") throw new Error("usage: tokens import <tokens.css> --out <name.lib.json>");
        return console.log(tokensImport(a._[2], flag(a, "out")!));
      case "export":
        if (a._[1] === "html") return console.log(exportHtml(a._[2], flag(a, "node"), flag(a, "out")));
        if (a._[1] === "spec") return console.log(exportSpec(a._[2], flag(a, "node"), flag(a, "format") ?? "md"));
        throw new Error("usage: export html|spec <file> --node X");
      default:
        console.log(USAGE);
        process.exit(cmd ? 1 : 0);
    }
  } catch (e: any) {
    console.error(`error: ${e.message}`);
    if (process.env.AERENDER_DEBUG) console.error(e.stack);
    process.exit(1);
  }
}
main();
