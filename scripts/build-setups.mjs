// Generateur des cartes de la page des setups.
//
// Ce que le §5.4 de la specification exige pour un blueprint vaut ici : le
// schema est LU depuis le fichier de setup, ecrit en SVG par ce script, et
// commite. La page n'en dessine aucun -- elle ne contient que du HTML deja
// rendu, et son seul script sert a reconnaitre le clavier branche.
//
// La consequence utile n'est pas la performance, c'est la verification :
// `check.mjs` regenere les cartes et refuse la page si elle ne correspond plus
// aux fichiers dont elle est censee parler. La carte devient une VERIFICATION
// du setup, pas une illustration.
//
//   node scripts/build-setups.mjs          verifie et dit ce qui differe
//   node scripts/build-setups.mjs --write  reecrit la page

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "setups");
export const PAGE = join(DIR, "index.html");
const START = "<!-- setups:start · genere par scripts/build-setups.mjs -->";
const END = "<!-- setups:end -->";

/** Les cinq familles que le Builder produit, plus celles que le MiniLab declare. */
const HUE = {
  knob: "#4fd1ff", pad: "#ff5fb0", fader: "#ffc861", wheel: "#7ee787",
  strip: "#7ee787", button: "#a9b4c6", utility: "#a9b4c6", "main-click": "#a9b4c6",
  main: "#4fd1ff", display: "#5d6879"
};
/** Le nom lisible d'une famille, au singulier et au pluriel. */
const NOUN = {
  knob: ["knob", "knobs"], pad: ["pad", "pads"], fader: ["fader", "faders"],
  wheel: ["wheel", "wheels"], strip: ["touch strip", "touch strips"],
  button: ["button", "buttons"], utility: ["utility key", "utility keys"],
  main: ["main encoder", "main encoders"], "main-click": ["encoder click", "encoder clicks"],
  display: ["display", "displays"]
};

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n2 = (v) => Math.round(v * 100) / 100;

/**
 * Le schema, dans les formes exactes du Builder.
 *
 * Elles sont recopiees de `builder/builder.js` -- meme unite `u`, memes rayons --
 * pour qu'un auteur retrouve sur la carte le dessin qu'il a vu en calibrant. Une
 * famille inconnue de ce fichier tombe sur la forme neutre plutot que de
 * disparaitre : un setup ne doit jamais avoir l'air plus pauvre qu'il n'est.
 */
function blueprint(profile) {
  const W = profile.device?.layout?.width || 520;
  const H = profile.device?.layout?.height || 220;
  const u = W / 52;
  const shapes = (profile.controls || [])
    .filter((c) => c.layout && Number.isFinite(c.layout.x) && Number.isFinite(c.layout.y))
    .map((c) => {
      const h = HUE[c.family] || "#a9b4c6";
      const x = n2(c.layout.x);
      const y = n2(c.layout.y);
      const w = n2(u / 7);
      if (c.family === "knob" || c.family === "main") {
        return `<circle cx="${x}" cy="${y}" r="${n2(u * 1.1)}" fill="#141922" stroke="${h}" stroke-width="${w}"/>`
          + `<line x1="${x}" y1="${n2(y - u * 0.3)}" x2="${x}" y2="${n2(y - u * 0.9)}" stroke="${h}" stroke-width="${w}"/>`;
      }
      if (c.family === "pad") {
        return `<rect x="${n2(x - u * 1.5)}" y="${n2(y - u * 1.3)}" width="${n2(u * 3)}" height="${n2(u * 2.6)}" rx="${n2(u / 3)}" fill="#141922" stroke="${h}" stroke-width="${w}"/>`;
      }
      if (c.family === "fader") {
        return `<rect x="${n2(x - u / 6)}" y="${n2(y - u * 2.5)}" width="${n2(u / 3)}" height="${n2(u * 5)}" rx="${n2(u / 6)}" fill="#2a3342"/>`
          + `<rect x="${n2(x - u * 0.7)}" y="${n2(y - u * 0.4)}" width="${n2(u * 1.4)}" height="${n2(u * 0.8)}" rx="${n2(u / 5)}" fill="#141922" stroke="${h}" stroke-width="${w}"/>`;
      }
      if (c.family === "button" || c.family === "utility" || c.family === "main-click") {
        return `<rect x="${n2(x - u)}" y="${n2(y - u * 0.7)}" width="${n2(u * 2)}" height="${n2(u * 1.4)}" rx="${n2(u / 4)}" fill="#141922" stroke="${h}" stroke-width="${n2(u / 8)}"/>`;
      }
      if (c.family === "display") {
        return `<rect x="${n2(x - u * 2.2)}" y="${n2(y - u * 1.6)}" width="${n2(u * 4.4)}" height="${n2(u * 3.2)}" rx="${n2(u / 4)}" fill="#0a0d12" stroke="${h}" stroke-width="${n2(u / 9)}"/>`;
      }
      return `<rect x="${n2(x - u * 0.85)}" y="${n2(y - u * 2.5)}" width="${n2(u * 1.7)}" height="${n2(u * 5)}" rx="${n2(u * 0.85)}" fill="#141922" stroke="${h}" stroke-width="${w}"/>`;
    });
  return { W, H, svg: shapes.join("") };
}

/** « 8 knobs, 4 faders, 2 touch strips » -- ce que l'appareil a, dans son ordre. */
function inventory(profile) {
  const counts = new Map();
  for (const c of profile.controls || []) counts.set(c.family, (counts.get(c.family) || 0) + 1);
  return [...counts].map(([family, n]) => {
    const noun = NOUN[family] || [family, family + "s"];
    return `${n} ${n === 1 ? noun[0] : noun[1]}`;
  }).join(", ");
}

/** Les ports que le setup declare, avec leur role : c'est ce qui reconnait. */
function ports(profile) {
  return (profile.device?.ports || [])
    .map((p) => ({ name: p.match?.name || "", role: p.role || "" }))
    .filter((p) => p.name);
}

export function readSetups() {
  return readdirSync(DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({ file: name, profile: JSON.parse(readFileSync(join(DIR, name), "utf8")) }));
}

export function renderCards(setups) {
  return setups.map(({ file, profile }) => {
    const { W, H, svg } = blueprint(profile);
    const author = profile.author?.trim();
    const silent = profile.completeness?.untested ?? 0;
    const declared = profile.completeness?.declared ?? (profile.controls || []).length;
    const observed = profile.completeness?.observed ?? 0;
    const portList = ports(profile).map((p) =>
      `<li><code>${esc(p.name)}</code> <span class="role">${esc(p.role)}</span></li>`).join("\n            ");

    return `      <article class="setup" id="setup-${esc(profile.profileId)}" data-setup="${esc(file)}">
        <div class="setup-head">
          <div>
            <h3>${esc(profile.name || profile.profileId)}</h3>
            <p class="setup-id"><code>${esc(profile.profileId)}</code> · revision ${esc(profile.revision ?? 1)} · ${
              author ? `mapped by <strong>${esc(author)}</strong>` : "no nickname given"
            }</p>
          </div>
          <p class="setup-match" hidden>Your keyboard</p>
        </div>

        <svg class="blueprint" viewBox="0 0 ${W} ${H}" role="img"
             aria-label="Schematic of the ${esc(profile.name || profile.profileId)}: ${esc(inventory(profile))}, each drawn where it sits on the device.">${svg}</svg>

        <dl class="setup-facts">
          <div><dt>Controls</dt><dd>${declared}<small>${esc(inventory(profile))}</small></dd></div>
          <div><dt>Answered</dt><dd>${observed}<small>${silent ? `${silent} declared silent` : "every one observed"}</small></dd></div>
          <div><dt>Written</dt><dd>${esc(profile.createdAt || "—")}<small>format version ${esc(profile.formatVersion ?? 1)}</small></dd></div>
        </dl>

        <p class="setup-ports-label">Recognised by the port it announces</p>
        <ul class="setup-ports">
            ${portList || "<li>no port declared</li>"}
        </ul>

        <p class="setup-actions">
          <a class="btn" href="/setups/${esc(file)}" download>Download ${esc(file)}</a>
        </p>
      </article>`;
  }).join("\n\n");
}

export function renderBlock() {
  const setups = readSetups();
  return `${START}\n${renderCards(setups)}\n      ${END}`;
}

function currentBlock(html) {
  const from = html.indexOf(START);
  const to = html.indexOf(END);
  if (from < 0 || to < 0) throw new Error(`marqueurs absents de ${PAGE}`);
  return html.slice(from, to + END.length);
}

export function pageIsCurrent() {
  const html = readFileSync(PAGE, "utf8");
  const wanted = `${START}\n${renderCards(readSetups())}\n      ${END}`;
  return { ok: currentBlock(html) === wanted, wanted, html };
}

if (process.argv[1] && process.argv[1].endsWith("build-setups.mjs")) {
  const { ok, wanted, html } = pageIsCurrent();
  if (process.argv.includes("--write")) {
    writeFileSync(PAGE, html.replace(currentBlock(html), wanted));
    console.log(`setups: ${readSetups().length} carte(s) ecrite(s).`);
  } else if (ok) {
    console.log(`setups: ${readSetups().length} carte(s), la page correspond aux fichiers.`);
  } else {
    console.error("setups: la page ne correspond plus aux fichiers. `node scripts/build-setups.mjs --write`");
    process.exit(1);
  }
}
