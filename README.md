# minihub-site

Site public de [MiniHub](https://github.com/DavidfromMonaco/minihub) —
`https://minihub.site`.

Le **site est en anglais**, ce fichier et les commentaires du code sont en
français, comme dans le dépôt de l'application.

---

## Ce que c'est

Des pages HTML écrites à la main. **Aucune étape de build**, aucune dépendance,
aucun générateur. Ce qui est dans ce dépôt est exactement ce qui est servi.

C'est le même parti pris que l'application ([D-003](https://github.com/DavidfromMonaco/minihub/blob/master/DECISIONS.md)),
et en 2026 ce n'est plus un handicap : `clamp()`, `text-wrap: balance`, les
container queries et `image-set()` font sans outillage ce qui demandait un
framework.

## Développer

Ouvrir `index.html` dans un navigateur. Il n'y a rien d'autre à lancer.

```bash
node scripts/check.mjs
```

Le vérificateur refuse : une ressource distante (la CSP est
`default-src 'self'`, une police chargée ailleurs échouerait **en silence**),
une `<img>` sans `alt`, un fichier référencé mais absent du disque, une seconde
feuille de style, un entête ou un pied divergent d'une page à l'autre, toute
image au-dessus de 300 Ko, une page dont la CSP n'est pas celle de sa nature
— `script-src 'none'` partout, `'self'` dans `builder/` et `setups/` seulement —
et une page de setups qui ne dit plus ce que disent les fichiers qu'elle décrit.

## Les setups

`setups/*.json` sont les fichiers publiés : ce que chaque contrôleur envoie et
où ses commandes se trouvent. Ce sont les fichiers que MiniHub lit, tels quels —
le site n'en dérive rien.

`setups/index.html` ne dessine rien dans le navigateur. **Les cartes et leurs
schémas sont générés puis commités** :

```bash
node scripts/build-setups.mjs           # dit si la page correspond aux fichiers
node scripts/build-setups.mjs --write   # la réécrit
```

C'est le §5.4 de la spécification contrôleurs : un schéma écrit par un script et
vérifié par `check.mjs` transforme la carte en **vérification** du setup, là où
un dessin fait à la main n'en serait qu'une illustration. Les formes sont celles
du Builder, à l'unité près, pour qu'un auteur retrouve ce qu'il a vu en calibrant.

Le seul script que la page exécute reconnaît le clavier branché.
**`midi/portRoles.js` est une copie octet pour octet** du fichier de
l'application (§3.5) : Windows décore les noms de ports — « Minilab3 MIDI »
arrive parfois en « MIDIIN2 (Minilab3 MIDI) » — et un `includes` écrit à la main
ici donnerait au site un avis différent de celui de MiniHub, ce qui ne se verrait
que chez quelqu'un d'autre, une fois le fichier téléchargé.

**Ce qui n'existe pas encore** : le Worker Cloudflare de D-026. Il n'y a donc ni
vote, ni bouton de signalement, ni dépôt direct d'un setup — un setup arrive à la
main, par les issues de ce dépôt. La page ne montre aucun de ces boutons plutôt
que d'en montrer qui ne feraient rien.

## Le Builder

`builder/index.html` est la seule page qui exécute du JavaScript, et c'est un
choix, pas un oubli : Web MIDI et le placement des contrôles sur une photo
n'existent pas sans script. Le reste du site est un document et le reste.

Il lit les messages du clavier branché, demande une famille de contrôles à la
fois — potards, faders, molettes, pads, boutons — et écrit un fichier de profil
que MiniHub sait charger. **La photo ne quitte jamais le navigateur** : elle sert
de fond pour poser les coordonnées, rien n'est envoyé nulle part.

Ses styles vivent dans `styles/site.css`, contenus sous `.builder`, qui
redéfinit ses propres jetons et n'emprunte rien à la coquille. Une seule feuille
pour tout le site, donc, comme l'exige le vérificateur.

Pour l'essayer, un serveur local suffit — **Web MIDI exige `localhost`, pas
`file://`** :

```bash
python -m http.server 8765
```

## Déploiement

GitHub Pages, depuis `master`, à la racine. Un `git push` suffit.

Le domaine `minihub.site` s'active en ajoutant un fichier `CNAME` contenant
`minihub.site`, **une fois les enregistrements DNS en place** — sinon Pages
redirige vers un domaine qui ne résout pas et l'adresse `*.github.io` cesse de
fonctionner.

Enregistrements attendus chez le registrar :

```
A      @      185.199.108.153
A      @      185.199.109.153
A      @      185.199.110.153
A      @      185.199.111.153
CNAME  www    davidfrommonaco.github.io.
```

## Polices

Geist et Geist Mono, variables (100–900), sous licence SIL OFL, **auto-hébergées**
dans `fonts/` — 92 Ko au total pour les sous-ensembles latin et latin-ext.
La CSP interdit Google Fonts, et c'est voulu : aucune requête ne part vers un
tiers depuis ce site.

## Images

Encodées en AVIF avec repli JPEG ou PNG, via `ffmpeg`. Le fond de héros passe
de 1,4 Mo à 7 Ko.

**Le fond garde sa luminosité d'origine** : l'atténuation est faite en CSS, par
`--hero-brightness` dans `styles/site.css`. La valeur `0.40` n'est pas un goût,
elle est mesurée — au-dessus, le pixel le plus clair de l'image fait tomber le
contraste du texte sous le seuil AA de 4,5:1. La régler ne demande pas de
réencoder quoi que ce soit.

Sources d'origine : `Pics Minihub Site/` dans le dépôt de l'application.

## Licence

MIT, comme l'application. MiniHub n'est pas affilié à Arturia ; MiniLab est une
marque d'Arturia.
