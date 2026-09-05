// La reconnaissance du clavier branche, et rien d'autre.
//
// La liste des setups est deja dans la page, en HTML rendu par
// `scripts/build-setups.mjs`. Ce script n'ecrit aucune carte : il lit celles qui
// existent, demande les entrees MIDI, et dit laquelle correspond.
//
// POURQUOI CE FICHIER IMPORTE LE MATCHER PLUTOT QUE DE COMPARER DES CHAINES
// ------------------------------------------------------------------------
// Windows decore : le port que MiniHub voit comme « Minilab3 MIDI » peut se
// presenter ici comme « MIDIIN2 (Minilab3 MIDI) ». Un `includes` ecrit a la main
// donnerait raison au site un jour sur deux, et le desaccord ne se verrait qu'une
// fois le fichier telecharge. `midi/portRoles.js` est la copie exacte du fichier
// de l'application : les deux repondent donc pareil, y compris sur le piege qui a
// motive ce code -- un port de pass-through porte le nom de l'appareil aussi
// fidelement que le port musical, et n'a jamais joue une note.
//
// POURQUOI UN BOUTON PLUTOT QU'UNE DEMANDE AU CHARGEMENT
// -----------------------------------------------------
// Web MIDI ouvre une invite de permission. La faire surgir sur une page qu'on
// vient d'ouvrir, sans l'avoir demandee, est le genre de chose qu'on refuse par
// reflexe -- et un refus est definitif pour l'origine.

import { bestPerformancePort } from "/midi/portRoles.js";

const state = document.getElementById("recognise-state");
const button = document.getElementById("recognise-go");
const note = document.getElementById("recognise-note");
const cards = [...document.querySelectorAll("[data-setup]")];

const say = (html) => { state.innerHTML = html; };

/** Le nom lisible d'une carte, pour ne pas le reconstruire depuis le fichier. */
const cardName = (card) => card.querySelector("h3")?.textContent?.trim() || card.dataset.setup;

/**
 * Les setups, lus depuis les fichiers que la page reference.
 *
 * Ils sont relus plutot que resumes dans des attributs : ce qui reconnait doit
 * etre le fichier publie lui-meme, pas une copie de ses ports qui pourrait
 * vieillir sans que rien ne le dise.
 */
async function loadSetups() {
  const loaded = [];
  for (const card of cards) {
    try {
      const response = await fetch(`/setups/${card.dataset.setup}`);
      if (!response.ok) continue;
      loaded.push({ card, profile: await response.json() });
    } catch {
      // Un setup illisible n'empeche pas les autres de repondre.
    }
  }
  return loaded;
}

function markMatch(card, portName) {
  card.classList.add("is-match");
  const badge = card.querySelector(".setup-match");
  if (badge) {
    badge.textContent = `Your keyboard · ${portName}`;
    badge.hidden = false;
  }
}

async function recognise() {
  button.disabled = true;
  say("Asking your browser for MIDI access…");

  let access;
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
  } catch {
    // Un refus est definitif pour l'origine : le dire, plutot que de laisser
    // croire que rien n'a repondu.
    say("MIDI access was refused. The list below is still yours to read — the "
      + "browser will not ask again unless you clear this site's permissions.");
    button.disabled = false;
    return;
  }

  const inputs = [...access.inputs.values()];
  if (inputs.length === 0) {
    say("No MIDI input is connected. Plug your controller in, then look again.");
    button.disabled = false;
    button.textContent = "Look again";
    return;
  }

  const setups = await loadSetups();
  const matched = [];
  for (const { card, profile } of setups) {
    const port = bestPerformancePort(profile, inputs);
    if (port) matched.push({ card, port });
  }

  if (matched.length > 0) {
    for (const { card, port } of matched) markMatch(card, port.name);
    const names = matched.map(({ card }) => `<strong>${cardName(card)}</strong>`).join(" and ");
    say(matched.length === 1
      ? `${names} — that is what is plugged in. Its setup is below, marked as yours.`
      : `${names} both answer to what is plugged in: two mappings of the same hardware. Either one works, and they share an id, so you can try one and go back without losing a cable.`);
    matched[0].card.scrollIntoView({ block: "center" });
  } else {
    const names = inputs.map((input) => `<code>${input.name}</code>`).join(", ");
    say(`Nobody has mapped this one yet: ${names}. That is what the Builder is `
      + `for — it starts from what your keyboard sends, one family of controls at `
      + `a time. <a href="/builder/">Open the Builder</a>.`);
  }

  button.hidden = true;
  note.hidden = true;
}

if (navigator.requestMIDIAccess) {
  button.addEventListener("click", recognise);
} else {
  // Le bouton reste visible mais desarme : le retirer laisserait croire que la
  // page ne sait pas faire, alors que c'est ce navigateur qui ne sait pas.
  button.disabled = true;
  say("This browser has no Web MIDI, so it cannot hear your controller. Chrome, "
    + "Edge and other Chromium browsers can; Firefox and Safari cannot. Every "
    + "setup below is still downloadable.");
}
