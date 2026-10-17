// Integration tests: render real fixtures, run the CLI, measure the DOM. Run with `npm test`.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { load, buildScene } from "../src/doc.js";
import { expandAll, Problems } from "../src/resolve.js";
import { Compiler } from "../src/compile.js";
import { withPage } from "../src/browser.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const BIN = path.join(ROOT, "bin/aerender.mjs");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "aerender-test-"));
const BASELINES = path.join(ROOT, "tests/baselines");
let failed = 0;

function cli(...args: string[]): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync(BIN, args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }) };
  } catch (e: any) {
    return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); console.log(`ok   ${name}`); } catch (e: any) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
function assert(cond: any, msg: string) { if (!cond) throw new Error(msg); }
const pngSize = (f: string) => { const b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const md5 = (f: string) => crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex");
const copy = (rel: string) => {
  const src = path.join(ROOT, rel), dst = path.join(TMP, `${Date.now()}-${path.basename(rel)}`);
  fs.cpSync(path.dirname(src), path.dirname(dst) + "/" + path.basename(path.dirname(src)), { recursive: true });
  return path.join(path.dirname(dst), path.basename(path.dirname(src)), path.basename(rel));
};

/** Share of pixels that differ by more than 48 levels in any channel, measured in Chrome. */
async function pngDiff(a: string, b: string): Promise<number> {
  const html = `<img id="a" src="file://${a}"><img id="b" src="file://${b}">`;
  return withPage(html, 1, (page) => page.evaluate(async () => {
    const imgs = [document.getElementById("a") as HTMLImageElement, document.getElementById("b") as HTMLImageElement];
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; }))));
    const data = imgs.map((i) => { const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight; const x = c.getContext("2d")!; x.drawImage(i, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; });
    let bad = 0;
    for (let k = 0; k < data[0].length; k += 4) if (Math.max(Math.abs(data[0][k] - data[1][k]), Math.abs(data[0][k + 1] - data[1][k + 1]), Math.abs(data[0][k + 2] - data[1][k + 2])) > 48) bad++;
    return bad / (data[0].length / 4);
  }));
}

async function measure<T>(file: string, fn: () => T): Promise<T> {
  const sc = buildScene(load(file));
  const probs = new Problems();
  const html = new Compiler(sc, probs).document(expandAll(sc, probs));
  return withPage(html, 1, (page) => page.evaluate(fn));
}

await test("examples match their regression baselines", async () => {
  const out = path.join(TMP, "baselines");
  const pairs: [string, string, string][] = [
    ["examples/dashboard/dashboard.scene.json", "client-engagements.png", "dashboard.png"],
    ["examples/flow/flow.scene.json", "phishing-response.png", "flow.png"],
    ["examples/social/social.scene.json", "social-card.png", "social-card.png"],
    ["examples/one-pager/one-pager.scene.json", "one-pager.png", "one-pager.png"],
    ["examples/example-brand/social.scene.json", "social-card.png", "example-brand.png"],
  ];
  for (const [scene, file, base] of pairs) {
    const dir = path.join(out, path.basename(path.dirname(scene)));
    assert(cli("render", scene, "--scale", "1", "--out", dir).code === 0, `render ${scene}`);
    const ours = path.join(dir, file), ref = path.join(BASELINES, base);
    assert(pngSize(ours).join() === pngSize(ref).join(), `${file} ${pngSize(ours)} vs baseline ${pngSize(ref)}`);
    const diff = await pngDiff(ours, ref);
    assert(diff < 0.01, `${scene} differs from ${base} on ${(diff * 100).toFixed(2)}% of pixels; run scripts/compare.py to see where`);
  }
});

await test("validate passes the examples and libraries", () => {
  const files = [...fs.readdirSync(path.join(ROOT, "examples")).map((d) => fs.readdirSync(path.join(ROOT, "examples", d)).filter((f) => f.endsWith(".scene.json")).map((f) => `examples/${d}/${f}`)).flat(),
    ...fs.readdirSync(path.join(ROOT, "brands")).map((b) => fs.readdirSync(path.join(ROOT, "brands", b)).filter((f) => f.endsWith(".lib.json")).map((f) => `brands/${b}/${f}`)).flat()];
  assert(files.length >= 12, `only ${files.length} files found`);
  for (const f of files) {
    const r = cli("validate", f);
    assert(r.code === 0, `${f}: ${r.out}`);
  }
});

await test("validate reports bad input with a path and hint", () => {
  const f = path.join(TMP, "bad.scene.json");
  fs.writeFileSync(f, JSON.stringify({ aerender: 1, children: [{ id: "a", type: "frame", layout: "grid", children: [{ id: "b", type: "icon", icon: "shield-chek" }, { id: "c", type: "text", textTransfrom: "uppercase" }] }] }));
  const r = cli("validate", f);
  assert(r.code === 1 && /children\[0\]\.layout/.test(r.out) && /shield-check/.test(r.out) && /textTransform/.test(r.out), r.out);
});

await test("lint passes good files and catches the broken copy", () => {
  for (const f of ["examples/dashboard/dashboard.scene.json", "examples/deck/deck.scene.json", "examples/social/social.scene.json", "examples/one-pager/one-pager.scene.json", "aerender:analystengine/ui", "aerender:analystengine/slides", "aerender:analystengine/assets"]) {
    const r = cli("lint", f, "--brand", path.join(ROOT, "brands/analystengine/tokens.css"));
    assert(r.code === 0, `${f}: ${r.out}`);
  }
  const r = cli("lint", "tests/fixtures/broken.scene.json");
  assert(r.code === 1 && /collapsed/.test(r.out) && /text-clipped/.test(r.out), r.out);
});

await test("lint flags off-palette colours with --brand", () => {
  const f = copy("tests/fixtures/ext-colour-alpha.scene.json");
  cli("set", f, "Tint", 'fill="#FF00FF"');
  const r = cli("lint", f, "--brand", path.join(ROOT, "brands/analystengine/tokens.css"));
  assert(r.code === 1 && /off-palette.*#FF00FF/.test(r.out), r.out);
  assert(cli("lint", "examples/example-brand/social.scene.json", "--brand", "aerender:example").code === 0, "own brand passes");
  assert(/off-palette/.test(cli("lint", "examples/example-brand/social.scene.json", "--brand", "aerender:analystengine").out), "other brand flagged");
});

await test("edit commands work through instances and on raw nodes", () => {
  const f = copy("examples/dashboard/dashboard.scene.json");
  assert(cli("set", f, "KPI findings/Value", 'content="41"').code === 0, "set through instance");
  assert(/"content": "41"/.test(cli("get", f, "KPI findings/Value").out), "get after set");
  assert(cli("insert", f, "Due next", '{"type":"text","name":"Hint","content":"x","fontFamily":"$t:ae-font-body"}', "--index", "0").code === 0, "insert");
  assert(cli("copy", f, "KPI findings", "KPI row", "--name", "KPI COPY").code === 0, "copy");
  assert(cli("move", f, "Hint", "Main/Content").code === 0, "move");
  assert(cli("delete", f, "Hint").code === 0, "delete");
  const amb = cli("get", f, "Label");
  assert(amb.code === 1 && /ambiguous/.test(amb.out), "ambiguity error: " + amb.out);
  const t = cli("tree", f).out;
  assert(/KPI COPY → KPI Card \(ui:uKpi\)/.test(t) && /Value="41"/.test(t) && !/Hint/.test(t), t);
});

await test("batch is atomic", () => {
  const f = copy("examples/dashboard/dashboard.scene.json");
  const before = md5(f);
  const bad = JSON.stringify([{ op: "set", path: "Page header/Title", props: { content: "X" } }, { op: "delete", path: "Nope" }]);
  assert(cli("batch", f, bad).code === 1 && md5(f) === before, "failed batch changed the file");
  const invalid = JSON.stringify([{ op: "set", path: "Page header/Title", props: { fill: "$missing" } }]);
  assert(cli("batch", f, invalid).code === 1 && md5(f) === before, "invalid batch changed the file");
  const good = JSON.stringify([{ op: "set", path: "Page header/Title", props: { content: "Engagements" } }, { op: "copy", path: "Clients", to: "Sidebar/Content", name: "Nav Copy" }]);
  assert(cli("batch", f, good).code === 0 && md5(f) !== before, "good batch did not apply");
});

await test("extension: textTransform", async () => {
  const r = await measure("tests/fixtures/ext-text-transform.scene.json", () => getComputedStyle(document.querySelector('[data-id="t1"]')!).textTransform);
  assert(r === "uppercase", r);
});
await test("extension: letterSpacing in em, literal and via variable", async () => {
  const w = await measure("tests/fixtures/ext-letter-spacing-em.scene.json", () => ["t1", "t2", "t3"].map((id) => document.querySelector(`[data-id="${id}"]`)!.getBoundingClientRect().width));
  assert(Math.abs(w[0] - w[1]) < 0.5 && Math.abs(w[0] - w[2]) < 0.5, `widths ${w}`);
});
await test("extension: icon lineWidth", async () => {
  const s = await measure("tests/fixtures/ext-icon-line-width.scene.json", () => ["i1", "i2"].map((id) => document.querySelector(`[data-id="${id}"] svg`)!.getAttribute("stroke-width")));
  assert(s[0] === "2" && s[1] === "1.5", `${s}`);
});
await test("extension: font fallback stacks", async () => {
  const r = await measure("tests/fixtures/ext-font-stack.scene.json", () => {
    const el = document.querySelector('[data-id="t1"]')!;
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = '20px "Inter Tight"';
    return [el.getBoundingClientRect().width, ctx.measureText(el.textContent!).width, getComputedStyle(el).fontFamily];
  });
  assert(Math.abs((r[0] as number) - (r[1] as number)) < 1 && /^"?Aptos/.test(String(r[2])), `${r}`);
});
await test("extension: colour variables with alpha", async () => {
  const r = await measure("tests/fixtures/ext-colour-alpha.scene.json", () => [getComputedStyle(document.querySelector('[data-id="b1"]')!).boxShadow, getComputedStyle(document.querySelector('[data-id="b2"]')!).backgroundColor]);
  assert(/\/ 0\.5\)/.test(r[0]) && /\/ 0\.25\)/.test(r[1]), `${r}`);
});
await test("extension: minWidth / maxWidth", async () => {
  const w = await measure("tests/fixtures/ext-min-max-width.scene.json", () => ["f1", "f2"].map((id) => document.querySelector(`[data-id="${id}"]`)!.getBoundingClientRect().width));
  assert(w[0] === 300 && w[1] === 160, `${w}`);
});
await test("extension: width/height bound to a variable", async () => {
  const r = await measure("tests/fixtures/ext-size-variable.scene.json", () => ["f1", "i1"].map((id) => { const b = document.querySelector(`[data-id="${id}"]`)!.getBoundingClientRect(); return `${b.width}x${b.height}`; }));
  assert(r[0] === "256x256" && r[1] === "24x24", `${r}`);
});
await test("unknown icon is a hard error with close matches", () => {
  const f = copy("tests/fixtures/ext-icon-line-width.scene.json");
  const raw = JSON.parse(fs.readFileSync(f, "utf8"));
  raw.children[0].children[0].icon = "shield-chek";
  fs.writeFileSync(f, JSON.stringify(raw));
  const r = cli("render", f, "--out", TMP);
  assert(r.code === 1 && /shield-check/.test(r.out), r.out);
});
await test("tokens import, slides library and deck PDF", () => {
  const out = path.join(TMP, "tok.lib.json");
  assert(/86 variables/.test(cli("tokens", "import", path.join(ROOT, "brands/analystengine/tokens.css"), "--out", out).out), "tokens import");
  const r = cli("render", "aerender:analystengine/slides", "--deck", "--out", path.join(TMP, "slides"));
  const lines = r.out.trim().split("\n");
  assert(r.code === 0 && lines.filter((l) => l.endsWith("@2x.png")).length === 10 && lines.some((l) => l.endsWith("deck.html")), r.out);
  const p = cli("render", "examples/deck/deck.scene.json", "--format", "pdf", "--out", path.join(TMP, "deck"));
  assert(p.code === 0 && fs.statSync(p.out.trim()).size > 10000, p.out);
});
await test("export html keeps custom properties; export spec lists content", () => {
  const h = cli("export", "html", "examples/dashboard/dashboard.scene.json", "--node", "Page header").out;
  assert(/var\(--ae-accent\)/.test(h) && /<button/.test(h) && !/#E6FC20;?"/.test(h.split(":root")[1]?.split("}")[1] ?? ""), "html");
  const s = cli("export", "spec", "aerender:analystengine/slides", "--node", "Slide/Title").out;
  assert(/Headline: "AI security readiness"/.test(s) && /Tokens:/.test(s), s);
});

await test("connectors: flow with decision and loop-back, elbow and straight routes", async () => {
  const r = await measure("tests/fixtures/flow.scene.json", () =>
    [...document.querySelectorAll<HTMLElement>('[data-t="connector"]')].map((c) => [c.dataset.route, JSON.parse(c.dataset.points ?? "[]").length]));
  assert(r.length === 9, `expected 9 connectors, got ${r.length}`);
  assert(r.filter(([route]) => route === "elbow").every(([, n]) => (n as number) >= 2) && r.some(([, n]) => (n as number) >= 4), `routes ${JSON.stringify(r)}`);
  assert(r.filter(([route]) => route === "straight").every(([, n]) => n === 2), `straight ${JSON.stringify(r)}`);
  assert(cli("lint", "tests/fixtures/flow.scene.json").code === 0, "flow lint");
  const f = copy("tests/fixtures/flow.scene.json");
  cli("insert", f, "Flow elbow/Canvas", '{"type":"connector","from":"Request","to":"Monitor"}');
  assert(/connector-crossing/.test(cli("lint", f).out), "crossing not flagged");
  const bad = copy("tests/fixtures/flow.scene.json");
  const e = cli("insert", bad, "Flow elbow/Canvas", '{"type":"connector","from":"Nowhere","to":"Monitor"}');
  assert(e.code === 1 && /Nowhere/.test(e.out), "missing endpoint accepted: " + e.out);
});

await test("deck view writes deck.html, deck.png, slide PNGs and PDF", () => {
  const out = path.join(TMP, "deckview");
  const r = cli("render", "examples/deck/deck.scene.json", "--deck", "--out", out);
  assert(r.code === 0, r.out);
  for (const f of ["deck.html", "deck.png", "deck.pdf", "01-cover@2x.png"]) assert(fs.existsSync(path.join(out, f)), `missing ${f}`);
  assert(/01 · Cover/.test(fs.readFileSync(path.join(out, "deck.html"), "utf8")), "deck.html labels");
});

await test("images: fill, fit, stretch, mono treatment and local asset add", async () => {
  const r = await measure("tests/fixtures/img/images.scene.json", () => {
    const st = (id: string) => getComputedStyle(document.querySelector(`[data-id="${id}"]`)!);
    const mono = document.querySelector('[data-id="d"] .ae-img') as HTMLElement;
    return [st("a").backgroundSize, st("b").backgroundSize, st("c").backgroundSize, mono ? getComputedStyle(mono).filter : "none"];
  });
  assert(r[0] === "cover" && r[1] === "contain" && r[2] === "100% 100%" && /grayscale\(1\)/.test(r[3]), `${r}`);
  const aliased = path.join(TMP, "alias-image.scene.json");
  fs.writeFileSync(aliased, JSON.stringify({ aerender: 1, children: [{ id: "p", type: "frame", width: 200, height: 100, fill: { type: "image", url: "aerender:analystengine/assets/data-centre-roof.jpg" } }] }));
  const bg = await measure(aliased, () => getComputedStyle(document.querySelector('[data-id="p"]')!).backgroundImage);
  assert(/brands\/analystengine\/assets\/data-centre-roof\.jpg/.test(bg), `aliased image: ${bg}`);
  const out = cli("asset", "add", "brands/analystengine/assets/editorial-placeholder.jpg", "--scene", path.join(TMP, "x.scene.json"));
  assert(/\.\/assets\/editorial-placeholder\.jpg/.test(out.out) && fs.existsSync(path.join(TMP, "assets/editorial-placeholder.jpg")), out.out);
});

await test("tree ids, move to root, copy re-ids slot fills, insert into instance, --help", () => {
  const f = copy("examples/dashboard/dashboard.scene.json");
  assert(/KPI row #kpis/.test(cli("tree", f, "--ids", "--depth", "4").out), "tree --ids");
  assert(/Sidebar #uSidebar/.test(cli("tree", "aerender:analystengine/ui", "--depth", "1").out), "component ids in library tree");
  assert(cli("copy", f, "Table", "Due next", "--name", "Table copy").code === 0, "copy with slot fills");
  assert(cli("validate", f).code === 0, "copy left duplicate ids");
  const d = copy("examples/deck/deck.scene.json");
  assert(cli("move", d, "Recommendations", "/", "--index", "0").code === 0, "move to root");
  assert(cli("tree", d, "--depth", "0").out.trim().startsWith("Recommendations"), "order after move");
  const ins = cli("insert", d, "Findings/Column[0]", '{"type":"text","name":"Extra","content":"x"}');
  assert(ins.code === 0 && /copied its/.test(ins.out), ins.out);
  const h = cli("tree", "--help");
  assert(h.code === 0 && /aerender tree/.test(h.out), h.out);
});

await test("bundled libraries resolve by alias from any directory", () => {
  const f = path.join(TMP, "alias.scene.json");
  fs.writeFileSync(f, JSON.stringify({ aerender: 1, imports: { s: "aerender:analystengine/slides" }, children: [{ id: "c", type: "ref", ref: "s:sTitle", name: "Cover" }] }));
  assert(cli("validate", f).code === 0 && /Cover → Slide\/Title/.test(cli("tree", f).out), "alias import");
  assert(/#dProcess/.test(cli("tree", "aerender:analystengine/slides", "--depth", "1").out), "alias as file argument");
  const libs = cli("libs").out;
  assert(/aerender:analystengine\/ui/.test(libs) && /aerender:example\/tokens/.test(libs), "libs listing");
  assert(/no bundled library "aerender:nope\/x"/.test(cli("tree", "aerender:nope/x").out), "unknown alias message");
});

await test("loader accepts only aerender scene and library files", () => {
  const wrongExt = path.join(TMP, "design.json");
  fs.writeFileSync(wrongExt, JSON.stringify({ aerender: 1, children: [] }));
  assert(/reads \.scene\.json scenes and \.lib\.json libraries/.test(cli("tree", wrongExt).out), "extension check");
  const noSchema = path.join(TMP, "old.scene.json");
  fs.writeFileSync(noSchema, JSON.stringify({ version: "1", children: [] }));
  assert(/add "aerender": 1/.test(cli("validate", noSchema).out), "schema check");
  const flat = path.join(TMP, "flat.scene.json");
  fs.writeFileSync(flat, JSON.stringify({ aerender: 1, children: [{ id: "a", type: "frame", stroke: "#383838", strokeWidth: 1 }] }));
  const r = cli("validate", flat);
  assert(r.code === 1 && /stroke must be an object/.test(r.out) && /"strokeWidth" is not a frame property/.test(r.out), r.out);
});

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
