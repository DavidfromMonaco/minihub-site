// Verificateur d'invariants du site. Node stdlib uniquement, aucune dependance.
//
// Le site n'a pas d'etape de build : rien ne se plaint tout seul quand une
// ressource manque ou qu'une balise <img> perd son alt. Ce script est donc la
// seule chose qui separe « ca marche » de « je crois que ca marche ».
//
//   node scripts/check.mjs

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const fail = (rule, detail) => failures.push({ rule, detail });

/** Toutes les pages HTML a la racine du site. */
function htmlPages(dir = ROOT, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) htmlPages(full, found);
    else if (entry.name.endsWith(".html")) found.push(full);
  }
  return found;
}

const pages = htmlPages();
if (pages.length === 0) fail("pages exist", "aucun fichier .html trouve");

for (const page of pages) {
  const rel = relative(ROOT, page).replace(/\\/g, "/");
  const html = readFileSync(page, "utf8");

  // 1. Aucune ressource distante. La CSP du site est `default-src 'self'` :
  //    une police ou une feuille chargee ailleurs echoue en silence, sans
  //    message, et la page s'affiche simplement mal.
  const remoteRes = [
    ...html.matchAll(/<(?:script|img|source|iframe|video|audio)\b[^>]*\bsrc(?:set)?=["'](https?:)?\/\//gi),
    ...html.matchAll(/<link\b[^>]*\brel=["'](?:stylesheet|preload)["'][^>]*\bhref=["'](https?:)?\/\//gi),
  ];
  if (remoteRes.length > 0) {
    fail("no remote resource", `${rel} charge ${remoteRes.length} ressource(s) distante(s)`);
  }

  // 2. Chaque image porte un alt. Un alt vide est valide pour une image
  //    decorative, mais un alt absent est toujours un oubli.
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt=/.test(tag)) {
      fail("img needs alt", `${rel} — ${tag.slice(0, 78)}…`);
    }
  }

  // 3. Chaque ressource locale referencee existe reellement sur le disque.
  const localRefs = new Set();
  for (const [, url] of html.matchAll(/(?:src|href|srcset)=["']([^"'#][^"']*)["']/gi)) {
    if (/^(https?:|mailto:|data:)/i.test(url)) continue;
    // Le fragment ne designe aucun fichier. « /#patch-bay » est la page
    // d'accueil vue depuis une autre page -- la forme absolue est ce qui
    // permet a l'entete d'etre le meme octet pour octet partout (regle 5),
    // et sans cette ligne la regle 3 irait chercher un fichier « #patch-bay ».
    const path = url.split("#")[0].split("?")[0].replace(/^\//, "");
    if (path === "") continue;
    localRefs.add(path);
  }
  for (const ref of localRefs) {
    if (!existsSync(join(ROOT, ref))) {
      fail("local asset exists", `${rel} reference ${ref}, absent du disque`);
    }
  }

  // 4. Une seule feuille de style. Le depot de l'application a paye ce
  //    probleme une fois (DECISIONS D-012) ; on ne le rejoue pas ici.
  const sheets = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)];
  if (sheets.length > 1) {
    fail("one stylesheet", `${rel} charge ${sheets.length} feuilles de style`);
  }
}

// 5. Entete et pied identiques d'une page a l'autre. Le site n'a pas de
//    gabarit : la duplication est assumee, donc elle doit etre verifiee.
if (pages.length > 1) {
  const slice = (html, tag) => (html.match(new RegExp(`<${tag}[\\s\\S]*?</${tag}>`, "i")) || [""])[0];
  for (const tag of ["header", "footer"]) {
    const seen = new Map();
    for (const page of pages) {
      const key = slice(readFileSync(page, "utf8"), tag).replace(/\s+/g, " ").trim();
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(relative(ROOT, page).replace(/\\/g, "/"));
    }
    if (seen.size > 1) {
      const groups = [...seen.values()].map((g) => g.join(", ")).join("  |  ");
      fail(`identical <${tag}>`, `${seen.size} versions differentes : ${groups}`);
    }
  }
}

// 6. Si un CNAME existe, il porte le domaine servi et lui seul. Son absence
//    est un etat valide : tant que les DNS ne resolvent pas, poser le CNAME
//    ferait rediriger *.github.io vers un domaine mort.
const cname = join(ROOT, "CNAME");
if (existsSync(cname)) {
  const domain = readFileSync(cname, "utf8").trim();
  if (domain !== "minihub.site") fail("CNAME correct", `CNAME contient « ${domain} »`);
}

// 7. Poids des images. Un fond de heros au-dessus de 300 Ko se voit au
//    chargement, sur une page dont c'est la premiere impression.
const imgDir = join(ROOT, "img");
if (existsSync(imgDir)) {
  for (const name of readdirSync(imgDir)) {
    const bytes = statSync(join(imgDir, name)).size;
    if (/\.(avif|jpg|jpeg|webp)$/i.test(name) && bytes > 300 * 1024) {
      fail("image budget", `img/${name} pese ${Math.round(bytes / 1024)} Ko (budget 300 Ko)`);
    }
  }
}

// 8. Deux surfaces, deux postures. Les pages du site sont des documents et
//    n'executent rien ; le Builder et la page des setups sont des outils, et
//    Web MIDI leur impose du script. La difference est voulue (§5.4, §5.5),
//    donc elle se verifie : une page qui gagnerait du script en silence est
//    exactement ce contre quoi la CSP est ecrite, et un Builder qui perdrait
//    la sienne ne dirait rien non plus -- il cesserait simplement de marcher.
for (const page of pages) {
  const rel = relative(ROOT, page).replace(/\\/g, "/");
  const html = readFileSync(page, "utf8");
  // Le contenu d'une CSP est plein d'apostrophes ('self', 'none') : la borne
  // du champ est le guillemet qui l'ouvre, pas la premiere apostrophe venue.
  const csp = (html.match(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*content=(["'])([^]*?)\1/i) || [])[2];
  if (!csp) {
    fail("CSP presente", `${rel} ne declare aucune Content-Security-Policy`);
    continue;
  }
  const script = ((csp.match(/script-src([^;]*)/i) || [])[1] || "").trim();
  // Les fiches appareil du §5.4 arriveront dans cette moitie-la : elles sont
  // des documents, et c'est cette ligne qui les y garde.
  const outil = rel.startsWith("builder/") || rel.startsWith("setups/");
  const attendu = outil ? "'self'" : "'none'";
  if (script !== attendu) {
    fail("posture CSP", `${rel} declare script-src « ${script || "(absent)"} », attendu « ${attendu} »`);
  }
}

// 9. Les cartes de la page des setups correspondent aux fichiers dont elles
//    parlent. Elles sont generees et commitees (§5.4 : le schema est ecrit par
//    un script, jamais dessine dans le navigateur), donc rien n'empeche la page
//    et les fichiers de diverger -- sauf ceci. Une carte qui annonce 25
//    controles pour un fichier qui en declare 41 serait pire qu'absente : elle
//    aurait l'air verifiee.
try {
  const { pageIsCurrent } = await import("./build-setups.mjs");
  if (!pageIsCurrent().ok) {
    fail("setups a jour", "setups/index.html ne correspond plus aux fichiers de setups/ "
      + "-- « node scripts/build-setups.mjs --write »");
  }
} catch (error) {
  fail("setups a jour", `la generation des cartes a echoue : ${error.message}`);
}

if (failures.length === 0) {
  console.log(`check: ${pages.length} page(s), tout est vert.`);
  process.exit(0);
}
console.error(`check: ${failures.length} probleme(s).\n`);
for (const { rule, detail } of failures) console.error(`  [${rule}] ${detail}`);
process.exit(1);
