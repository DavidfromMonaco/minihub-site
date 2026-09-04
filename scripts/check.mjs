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
    if (/^(https?:|mailto:|data:|\/$)/i.test(url)) continue;
    localRefs.add(url.split("?")[0].replace(/^\//, ""));
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

if (failures.length === 0) {
  console.log(`check: ${pages.length} page(s), tout est vert.`);
  process.exit(0);
}
console.error(`check: ${failures.length} probleme(s).\n`);
for (const { rule, detail } of failures) console.error(`  [${rule}] ${detail}`);
process.exit(1);
