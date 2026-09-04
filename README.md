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
feuille de style, un entête ou un pied divergent d'une page à l'autre, et toute
image au-dessus de 300 Ko.

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
