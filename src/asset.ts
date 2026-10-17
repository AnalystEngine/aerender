// `asset add`: copy or download an image next to a scene so renders never depend on the network.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { slug } from "./address.js";

const MAGIC: [string, (b: Buffer) => boolean][] = [
  [".jpg", (b) => b[0] === 0xff && b[1] === 0xd8],
  [".png", (b) => b.subarray(0, 4).toString("hex") === "89504e47"],
  [".gif", (b) => b.subarray(0, 3).toString() === "GIF"],
  [".webp", (b) => b.subarray(8, 12).toString() === "WEBP"],
  [".svg", (b) => /<svg[\s>]/i.test(b.subarray(0, 2048).toString())],
];

async function download(url: string): Promise<Buffer> {
  const errors: string[] = [];
  try {
    const r = await fetch(url, { headers: { "user-agent": "aerender/0.1 (AnalystEngine design tooling)" }, redirect: "follow" });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
    return Buffer.from(await r.arrayBuffer());
  } catch (e: any) {
    errors.push(`node fetch: ${e.cause?.code ?? e.cause?.message ?? e.message}`);
  }
  // curl uses the system certificate store, which may trust an intercepting proxy that Node does not.
  try {
    return execFileSync("curl", ["-fsSL", "--max-time", "60", "-A", "aerender/0.1", url], { maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e: any) {
    errors.push(`curl: ${String(e.stderr ?? e.message).trim()}`);
  }
  throw new Error(`could not download ${url}\n  ${errors.join("\n  ")}`);
}

export async function assetAdd(src: string, opts: { deck?: string; name?: string; credit?: string }): Promise<string> {
  if (!src) throw new Error("usage: asset add <url-or-path> [--scene file.scene.json] [--name x] [--credit 'Photo: ...']");
  const base = opts.deck ? path.dirname(path.resolve(opts.deck)) : process.cwd();
  const dir = path.join(base, "assets");
  const remote = /^https?:\/\//i.test(src);
  const data = remote ? await download(src) : fs.readFileSync(path.resolve(src));
  const kind = MAGIC.find(([, test]) => test(data));
  if (!kind) throw new Error(`${src} is not a JPEG, PNG, GIF, WebP or SVG image (got ${data.length} bytes starting ${JSON.stringify(data.subarray(0, 16).toString("latin1"))})`);
  const stem = opts.name ?? decodeURIComponent(path.basename((remote ? new URL(src).pathname : src).replace(/\.[a-z0-9]+$/i, "")));
  const file = path.join(dir, slug(stem).slice(0, 60) + kind[0]);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, data);
  if (opts.credit) fs.appendFileSync(path.join(dir, "CREDITS.txt"), `${path.basename(file)}: ${opts.credit}${remote ? ` (${src})` : ""}\n`);
  const rel = "./" + path.relative(base, file).split(path.sep).join("/");
  return [
    `saved ${file} (${Math.round(data.length / 1024)} KB)`,
    `use: "fill": {"type":"image","url":"${rel}","mode":"fill"}   add "imageFilter":"mono" on the node for the brand photo treatment`,
  ].join("\n");
}
