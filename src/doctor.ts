// `aerender doctor`: checks the runtime and renders a test scene, printing a fix for anything missing.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findChrome, CHROME_FIX } from "./chrome.js";
import { knownFonts, lucideNames, fontFaceCss } from "./assets.js";
import { PKG_ROOT, load, buildScene } from "./doc.js";
import { brandLibraries } from "./brands.js";
import { expandAll, Problems } from "./resolve.js";
import { Compiler } from "./compile.js";
import { withPage, screenshotNodes } from "./browser.js";

export async function doctor(version: string): Promise<{ ok: boolean; text: string }> {
  const lines: string[] = [];
  let ok = true;
  const check = (pass: boolean, label: string, detail: string, fix?: string) => {
    lines.push(`${pass ? "ok  " : "FAIL"} ${label}: ${detail}${!pass && fix ? `\n     fix: ${fix}` : ""}`);
    if (!pass) ok = false;
  };
  lines.push(`aerender ${version} (${PKG_ROOT})`);
  const major = +process.versions.node.split(".")[0];
  check(major >= 22, "Node", process.versions.node, "install Node 22 or later");
  const chrome = findChrome();
  check(!!chrome, "Chrome", chrome ? `${chrome.path} (from ${chrome.source})` : "not found", CHROME_FIX);
  let fonts = 0;
  try { fonts = (fontFaceCss().match(/@font-face/g) ?? []).length; } catch { /* reported below */ }
  check(fonts > 0, "Fonts", `${knownFonts().join(", ")} (${fonts} faces)`, "reinstall aerender; the @fontsource packages are missing");
  let icons = 0;
  try { icons = lucideNames().length; } catch { /* reported below */ }
  check(icons > 1000, "Icons", `${icons} lucide icons`, "reinstall aerender; lucide-static is missing");
  const libs = brandLibraries();
  check(libs.length > 0, "Libraries", libs.map((l) => l.alias).join(", ") || "none", "reinstall aerender; brands/ is missing");

  if (chrome) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aerender-doctor-"));
    try {
      const file = path.join(dir, "check.scene.json");
      fs.writeFileSync(file, JSON.stringify({
        aerender: 1, imports: { t: "aerender:analystengine/tokens" },
        children: [{ id: "f", type: "frame", name: "Check", width: 320, height: 120, fill: "$t:ae-bg", padding: 24, gap: 12, alignItems: "center", children: [
          { id: "i", type: "icon", icon: "shield-check", width: 32, height: 32, fill: "$t:ae-accent" },
          { id: "t", type: "text", content: "aerender works", fontFamily: "$t:ae-font-body", fontSize: 24, fill: "$t:ae-fg" }] }],
      }));
      const sc = buildScene(load(file));
      const probs = new Problems();
      const roots = expandAll(sc, probs);
      const html = new Compiler(sc, probs).document(roots);
      const out = path.join(dir, "check.png");
      const started = Date.now();
      await withPage(html, 1, (page) => screenshotNodes(page, [String(roots[0]._m.uid)], [out]));
      const size = fs.statSync(out).size;
      check(size > 1000 && !probs.list.some((p) => p.level === "error"), "Test render", `${size} bytes in ${Date.now() - started} ms`, "run with AERENDER_DEBUG=1 for the stack trace");
    } catch (e: any) {
      check(false, "Test render", e.message.split("\n")[0], e.message.includes("libraries") ? undefined : CHROME_FIX);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } else check(false, "Test render", "skipped (no Chrome)", CHROME_FIX);
  lines.push(ok ? "All checks passed." : "Fix the failures above, then run aerender doctor again.");
  return { ok, text: lines.join("\n") };
}
