// PROTOTYPE, throwaway (#142). Builds the montages in consistency.prototype-output/montages/
// and the owner's comparison page at /tmp/wayfinder-consistency/compare.html.
// Run after `npm run prototype:consistency -- results`:  node src/lib/consistency.prototype-report.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("src/lib/consistency.prototype-output");
const TMP = "/tmp/wayfinder-consistency";
const THUMBS = path.join(TMP, "thumbs");
const MAGICK = "/opt/homebrew/bin/magick";
const MONTAGE = "/opt/homebrew/bin/montage";
const FONT = "/System/Library/Fonts/Supplemental/Arial.ttf";
const results = JSON.parse(readFileSync(path.join(OUT, "results.json"), "utf8"));
const notes = JSON.parse(readFileSync(path.join(OUT, "observations.json"), "utf8"));
mkdirSync(path.join(OUT, "montages"), { recursive: true });
mkdirSync(THUMBS, { recursive: true });

const STYLES = [
  { id: "classical", label: "Classical" },
  { id: "watercolour", label: "Ink & Watercolor" },
  { id: "stained-glass", label: "Stained Glass" },
];
const CONDITIONS = [
  { id: "A-lite", label: "A · Today", sub: "Text prompt, no canon · Lite" },
  { id: "B-lite", label: "B · Canon text", sub: "Canon text (+ section look) · Lite" },
  { id: "C-lite", label: "C · Refs, Lite", sub: "Canon text + reference images · Lite" },
  { id: "C-flash", label: "C · Refs, 3.1 Flash", sub: "Canon text + reference images · 3.1 Flash" },
  { id: "D1-lite", label: "D1 · Per-style sheet", sub: "Peter sheet painted in each style · Lite", peterOnly: true },
  { id: "D2-lite", label: "D2 · Sheet + style ref", sub: "Classical Peter sheet + style reference · Lite", peterOnly: true },
];
const SETS = [
  { id: "peter", label: "Peter + Galilee" },
  { id: "exodus", label: "Exodus 14 section" },
];
const byId = new Map(results.images.map((i) => [i.id, i]));
const verses = (set) => results.verses.filter((v) => v.set === set);
const imageFor = (verse, style, cond) => {
  // D conditions only vary the non-Classical styles; their Classical cell is condition C on Lite.
  const c = cond.startsWith("D") && style === "classical" ? "C-lite" : cond;
  return byId.get(`${verse}--${style}--${c}`);
};
const refName = (v) => `${v.name} ${v.chapter}:${v.verse}`;

// ------------------------------------------------------------ montages (committed)
for (const set of SETS) {
  for (const cond of CONDITIONS) {
    if (cond.peterOnly && set.id !== "peter") continue;
    const args = ["-font", FONT, "-pointsize", "15", "-background", "white"];
    for (const v of verses(set.id)) {
      for (const s of STYLES) {
        const img = imageFor(v.id, s.id, cond.id);
        const label = `${refName(v)} · ${s.label}${img?.costUsd ? ` · ${(img.ms / 1000).toFixed(1)} s · ${img.credits} cr` : ""}`;
        args.push("-label", label, img?.file ? path.join(OUT, img.file) : "xc:#ddd");
      }
    }
    const file = path.join(OUT, "montages", `${set.id}--${cond.id}.jpg`);
    args.push("-tile", "3x", "-geometry", "440x248+4+4", "-title", `${set.label} — ${cond.label} (${cond.sub})`, "-quality", "80", file);
    execFileSync(MONTAGE, args);
  }
}
// Conditions side by side, one sheet per set and style: rows are verses, columns are conditions.
for (const set of SETS) {
  for (const s of STYLES) {
    const conds = CONDITIONS.filter((c) => !c.peterOnly || (set.id === "peter" && s.id !== "classical"));
    const args = ["-font", FONT, "-pointsize", "15", "-background", "white"];
    for (const v of verses(set.id)) {
      for (const c of conds) {
        const img = imageFor(v.id, s.id, c.id);
        args.push("-label", `${refName(v)} · ${c.label}`, img?.file ? path.join(OUT, img.file) : "xc:#ddd");
      }
    }
    args.push("-tile", `${conds.length}x`, "-geometry", "400x225+4+4", "-title", `${set.label} — ${s.label}: conditions side by side`, "-quality", "80",
      path.join(OUT, "montages", `${set.id}--${s.id}--by-condition.jpg`));
    execFileSync(MONTAGE, args);
  }
}
// Icon follow-up sheets: B (canon text) vs D2 (Classical sheets + Icon style reference), Lite.
for (const set of SETS) {
  const args = ["-font", FONT, "-pointsize", "15", "-background", "white"];
  for (const v of verses(set.id)) {
    for (const [c, label] of [["B-lite", "B · Canon text"], ["D2-lite", "D2 · Classical sheets + Icon style ref"]]) {
      const img = byId.get(`${v.id}--icon--${c}`);
      args.push("-label", `${refName(v)} · ${label}${img?.ms ? ` · ${(img.ms / 1000).toFixed(1)} s · ${img.refs.length} refs` : ""}`, img?.file ? path.join(OUT, img.file) : "xc:#ddd");
    }
  }
  args.push("-tile", "2x", "-geometry", "560x315+4+4", "-title", `${set.label} — Byzantine Icon (Lite): conditions side by side`, "-quality", "80",
    path.join(OUT, "montages", `${set.id}--icon--by-condition.jpg`));
  execFileSync(MONTAGE, args);
}
{
  const prior = path.resolve("src/lib/art-styles.prototype-output");
  const cells = [
    [path.join(prior, "gen-1-3--icon.jpg"), "Style test (#138), production budget, no rule"],
    [path.join(prior, "full-brief", "gen-1-3--icon.jpg"), "Style test (#138), full brief, no rule"],
    ...[1, 2].map((n) => { const i = byId.get(`gen-1-3--icon--B-lite-s${n}`); return [path.join(OUT, i.file), `Sample ${n} · firm rule · ${(i.ms / 1000).toFixed(1)} s`]; }),
  ];
  const args = ["-font", FONT, "-pointsize", "15", "-background", "white"];
  for (const [file, label] of cells) args.push("-label", label, existsSync(file) ? file : "xc:#ddd");
  args.push("-tile", "2x", "-geometry", "560x315+4+4", "-title", "Genesis 1:3 — Byzantine Icon (Lite): before and after the divine-presence rule", "-quality", "80",
    path.join(OUT, "montages", "genesis--icon.jpg"));
  execFileSync(MONTAGE, args);
}
// Reference sheets montage.
{
  const args = ["-font", FONT, "-pointsize", "15", "-background", "white"];
  for (const s of results.sheets) {
    if (!s.file) continue;
    args.push("-label", s.id, path.join(OUT, s.file));
  }
  args.push("-tile", "4x", "-geometry", "440x246+4+4", "-title", "Reference art (3.1 Flash)", "-quality", "80", path.join(OUT, "montages", "references.jpg"));
  execFileSync(MONTAGE, args);
}

// ------------------------------------------------------------ thumbnails
function thumb(rel, name) {
  const dest = path.join(THUMBS, `${name}.jpg`);
  if (!existsSync(dest)) execFileSync(MAGICK, [path.join(OUT, rel), "-resize", "520x", "-strip", "-quality", "72", dest]);
  return dest;
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ------------------------------------------------------------ compare page
const sheetsFor = {
  peter: ["peter--classical", "peter--watercolour", "peter--stained-glass", "sea-of-galilee--classical", "style--watercolour", "style--stained-glass"],
  exodus: ["moses--classical", "red-sea-crossing--classical"],
};
const sheetLabel = {
  "peter--classical": "Peter · Classical sheet", "peter--watercolour": "Peter · Watercolor sheet (D1)",
  "peter--stained-glass": "Peter · Stained Glass sheet (D1)", "sea-of-galilee--classical": "Sea of Galilee · two views",
  "style--watercolour": "Watercolor style ref (D2)", "style--stained-glass": "Stained Glass style ref (D2)",
  "moses--classical": "Moses (elder) · Classical sheet", "red-sea-crossing--classical": "Red Sea · one view",
};
const sheetById = new Map(results.sheets.map((s) => [s.id, s]));

let panels = "";
for (const set of SETS) {
  const refs = sheetsFor[set.id].map((id) => {
    const s = sheetById.get(id);
    return `<figure><img src="${thumb(s.file, `ref--${id}`)}" alt="${esc(sheetLabel[id])}"><figcaption>${esc(sheetLabel[id])}</figcaption></figure>`;
  }).join("");
  panels += `<section class="refs" data-set="${set.id}"><h3>Reference art · 3.1 Flash · $0.067 each</h3><div class="refgrid">${refs}</div></section>`;
  for (const cond of CONDITIONS) {
    if (cond.peterOnly && set.id !== "peter") continue;
    const note = notes.conditions?.[`${set.id}--${cond.id}`] ?? "";
    let rows = `<div class="head"></div>${STYLES.map((s) => `<div class="colhead">${esc(s.label)}</div>`).join("")}`;
    for (const v of verses(set.id)) {
      rows += `<div class="rowhead">${esc(refName(v))}</div>`;
      for (const s of STYLES) {
        const img = imageFor(v.id, s.id, cond.id);
        const reused = cond.id.startsWith("D") && s.id === "classical";
        if (!img?.file) { rows += `<figure class="missing"><div>not generated</div></figure>`; continue; }
        const src = thumb(img.file, img.id);
        const cap = `${(img.ms / 1000).toFixed(1)} s · ${img.credits} cr · ${img.refs.length} ref${img.refs.length === 1 ? "" : "s"} · ${img.promptChars.toLocaleString("en-US")} ch${reused ? " · same as C Lite" : ""}`;
        const cellNote = notes.cells?.[img.id] ? `<span class="flag">${esc(notes.cells[img.id])}</span>` : "";
        rows += `<figure${reused ? ' class="reused"' : ""}><img src="${src}" alt="${esc(`${refName(v)}, ${s.label}, ${cond.label}`)}"><figcaption>${esc(cap)}${cellNote}</figcaption></figure>`;
      }
    }
    panels += `<section class="panel" data-set="${set.id}" data-cond="${cond.id}"><p class="note"><strong>${esc(cond.sub)}.</strong> ${esc(note)}</p><div class="grid">${rows}</div></section>`;
  }
}

const condButtons = CONDITIONS.map((c) => `<button type="button" data-cond="${c.id}"${c.peterOnly ? ' data-peter-only="1"' : ""}>${esc(c.label)}</button>`).join("");
const setButtons = SETS.map((s) => `<button type="button" data-set="${s.id}">${esc(s.label)}</button>`).join("");
const findings = (notes.summary ?? []).map((f) => `<li>${esc(f)}</li>`).join("");
const imgs = results.images.filter((i) => i.file);
const sum = (arr) => arr.reduce((s, x) => s + (x ?? 0), 0);
const perModel = (m) => imgs.filter((i) => i.model.endsWith(m));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
const p90 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(s.length * 0.9) - 1)] : 0; };
const lite = perModel("flash-lite-image"); const flash = perModel("3.1-flash-image");
const latency = (xs) => `median ${(median(xs.map((i) => i.ms)) / 1000).toFixed(1)} s, p90 ${(p90(xs.map((i) => i.ms)) / 1000).toFixed(1)} s`;
const creditsRange = (xs) => { const lo = Math.min(...xs.map((i) => i.credits)), hi = Math.max(...xs.map((i) => i.credits)); return lo === hi ? `${lo} credits each` : `${lo}–${hi} credits`; };

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Consistency prototype · #142</title>
<style>
:root { color-scheme: light dark; }
body { margin: 0; font-family: var(--font-sans, system-ui, sans-serif); color: var(--foreground, #111); }
.wrap { width: 100%; padding: 0 0 8px; box-sizing: border-box; }
h3 { font-size: .85rem; margin: 0 0 6px; color: var(--muted-foreground, #666); font-weight: 600; }
.lede { margin: 0 0 12px; color: var(--muted-foreground, #666); font-size: .9rem; }
.findings { margin: 0 0 14px; padding-left: 1.1rem; font-size: .88rem; line-height: 1.4; }
.findings li { margin: 2px 0; }
.bar { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
.bar button { font: inherit; font-size: .82rem; padding: 5px 10px; border-radius: var(--radius, 6px); border: 1px solid var(--border, #ccc); background: transparent; color: var(--foreground, #111); cursor: pointer; }
.bar button[aria-pressed="true"] { background: var(--primary, #222); color: var(--primary-foreground, #fff); border-color: var(--primary, #222); }
.bar button:disabled { opacity: .35; cursor: not-allowed; }
.refs, .panel { display: none; }
.refs.on, .panel.on { display: block; }
.refgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; margin-bottom: 12px; }
.note { font-size: .86rem; line-height: 1.4; margin: 4px 0 10px; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 8px; }
.head { display: none; }
.colhead { font-size: .8rem; font-weight: 600; border-bottom: 1px solid var(--border, #ccc); padding-bottom: 3px; }
.rowhead { grid-column: 1 / -1; font-size: .82rem; font-weight: 600; margin-top: 6px; }
figure { margin: 0; min-width: 0; }
figure img { width: 100%; height: auto; display: block; border-radius: var(--radius, 6px); border: 1px solid var(--border, #ccc); box-sizing: border-box; }
figure.reused img { opacity: .55; }
figcaption { font-size: .72rem; color: var(--muted-foreground, #666); margin-top: 2px; line-height: 1.3; }
.flag { display: block; color: var(--foreground, #111); }
.missing div { aspect-ratio: 16 / 9; border: 1px dashed var(--border, #ccc); border-radius: var(--radius, 6px); display: grid; place-items: center; font-size: .75rem; color: var(--muted-foreground, #666); }
footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid var(--border, #ccc); font-size: .78rem; color: var(--muted-foreground, #666); line-height: 1.45; }
</style></head><body><div class="wrap">
<p class="lede"><strong>Do characters and locations hold across verses and art styles?</strong> Wayfinder #142 prototype · branch <code>prototype/consistency</code> · every verse generated on its own from one shared scene plan; only the condition changes. Captions: latency · credits (ceil(usd×125)) · references · prompt characters.</p>
<ul class="findings">${findings}</ul>
<div class="bar" role="group" aria-label="Set">${setButtons}</div>
<div class="bar" role="group" aria-label="Condition">${condButtons}</div>
${panels}
<footer>Spend: <strong>$${results.spendUsd.toFixed(4)}</strong> of the $6.50 prototype cap (${results.billedCalls} billed OpenRouter calls: reference art $${(results.spendByKind.sheet + results.spendByKind["style-ref"]).toFixed(4)}, verse images $${results.spendByKind.verse.toFixed(4)}; planner and section-look drafts free). Lite: ${lite.length} images, ${creditsRange(lite)}, ${latency(lite)}. 3.1 Flash: ${flash.length} images, ${creditsRange(flash)}, ${latency(flash)}. Target: ≤10 credits, ~≤10 s. Prompts built at PROTOTYPE_PROMPT_MAX_CHARS=${results.promptMaxChars} (no trimming).</footer>
</div>
<script>
(() => {
  let set = "peter", cond = "A-lite";
  const render = () => {
    document.querySelectorAll(".bar button[data-set]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.set === set)));
    document.querySelectorAll(".bar button[data-cond]").forEach((b) => {
      b.disabled = Boolean(b.dataset.peterOnly) && set !== "peter";
      b.setAttribute("aria-pressed", String(b.dataset.cond === cond));
    });
    document.querySelectorAll(".refs").forEach((s) => s.classList.toggle("on", s.dataset.set === set));
    document.querySelectorAll(".panel").forEach((s) => s.classList.toggle("on", s.dataset.set === set && s.dataset.cond === cond));
  };
  document.querySelectorAll(".bar button[data-set]").forEach((b) => b.addEventListener("click", () => {
    set = b.dataset.set;
    if (set !== "peter" && cond.startsWith("D")) cond = "C-lite";
    render();
  }));
  document.querySelectorAll(".bar button[data-cond]").forEach((b) => b.addEventListener("click", () => { cond = b.dataset.cond; render(); }));
  render();
})();
</script></body></html>`;
writeFileSync(path.join(TMP, "compare.html"), html);
console.log(`compare.html ${(statSync(path.join(TMP, "compare.html")).size / 1024).toFixed(1)} KB; montages in ${path.join(OUT, "montages")}`);
