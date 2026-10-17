# Compositions de cartes (« Combined charts » + « Current chart ») — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de superposer à la variable affichée d'autres variables (aplat, isolignes et/ou flèches, chacune réglable), de choisir des compositions toutes faites façon cartes de prévisionniste, et d'enregistrer ses propres compositions, partageables par lien.

**Architecture:** Portage des modules **purs** d'open-meteo/maps (PR #361 : `chart-types`, `chart-encoding`, `chart-presets` + tests), adaptés au français. Le rendu n'importe **pas** leur `FrameManager` (#387). Il est **additif** : la variable affichée garde tout le pipeline actuel (`rasterManager`, `vectorManager`, overlay vent, couche 2, valeurs aux points de grille), et chaque **superposition** reçoit ses propres `SlotManager` (aplat et/ou vecteur), rattachés au commit groupé existant de `layers.ts`. Une composition = `variable` (fond) + `overlays: ChartSource[]`.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, TypeScript, MapLibre GL 6, `@openmeteo/weather-map-layer` (fork 0.3.0), `svelte-persisted-store`, Vitest, Tailwind v4.

**Spec:** pas de document de design séparé ; l'utilisateur a demandé de porter les deux fonctions upstream. Ce plan fixe les décisions (section « Décisions prises »). Référence upstream : remote `upstream` (open-meteo/maps), `upstream/main` @ `dc24e1f` ; fichiers lisibles via `git show upstream/main:<chemin>`.

## Décisions prises (à valider à la relecture)

1. **Modèle additif**, pas de remplacement du pipeline principal : aucune régression possible quand il n'y a pas de superposition.
2. **Changer la variable dans « Calques » garde les superpositions** (ex. « T850 + isobares » → T2m garde les isobares). Upstream, lui, repart d'une carte simple.
3. Une superposition dont la variable n'existe pas sur le domaine courant est **conservée mais ni rendue ni requêtée**. Elle reste grisée dans le panneau et revient si on retourne sur un domaine qui la sert.
4. Une superposition qui **double** le pipeline principal (même variable que le fond, ou flèches du niveau de vent déjà dessiné) est neutralisée flag par flag.
5. Couche 2 (`variable2`) et overlay vent restent **inchangés** : leur unification avec les compositions est hors périmètre.
6. Hors périmètre v1 : valeurs des superpositions dans le popup, légende des superpositions, préchargement des échéances voisines pour les superpositions, superpositions sur le domaine anomalie.
7. Paramètre d'URL `overlays=` (grammaire `sources` d'upstream, sur les superpositions seules) ; le fond reste `variable=`.

## Global Constraints

- Tout texte visible en **français**, avec accents (« Isolignes », « Flèches », « Aplat », « Superpositions », « Compositions »).
- Svelte 5 runes uniquement (`$state`, `$derived`, `$effect`, `$props`). Si le plugin `sveltejs/ai-tools` est installé, valider chaque `.svelte` avec `svelte-autofixer`.
- Imports via `$lib/…` (jamais `#lib/…` d'upstream ni de chemins relatifs entre dossiers).
- Aucune nouvelle dépendance npm.
- Sans superposition, les URL `om://` et le rendu sont **identiques** à aujourd'hui (les tests existants doivent passer sans modification).
- Prettier (tabs, single quotes, 100 col) : lancer `npx prettier --write` sur les fichiers touchés uniquement (pas `npm run format`, qui reformate des fichiers hors sujet).
- Branche : `feat/compositions` depuis `main` à jour. Titre de PR sémantique (`feat:`).
- Mettre à jour la doc dans le même changement (cf. `.claude/CLAUDE.md`, « Keeping these docs in sync ») : Task 6.

## Review Focus

1. **Changement de domaine** vers un domaine sans la variable d'une superposition : pas de 404 ni de toast en boucle, superposition grisée, restaurée au retour. → tests Task 2 (`isSourceAvailable`) et Task 4 (`desiredOverlayLayers` l'exclut).
2. **Doublon avec le fond** (même variable, ou flèches du même niveau de vent que l'overlay vent) : jamais dessiné deux fois. → tests Task 2 (`effectiveOverlayFlags`).
3. **Valeur `overlays` invalide** (URL partagée corrompue, état persisté d'une ancienne version) : ignorée avec un toast, pas de crash, état précédent intact. → test Task 3.
4. **Lecture animée / scrubbing** avec superpositions : le fondu attend toutes les couches, et une superposition en erreur ne bloque pas le groupe. → test Task 4 (`planOverlayUpdates`) + vérification manuelle Task 6.
5. **Rechargement du style** (bascule fond sombre/clair, `reloadStyles()`) : les superpositions sont recréées, pas perdues. → vérification manuelle Task 6 ; `addOmFileLayers` recrée la pile (Task 4).

---

### Task 1 : Porter les modules purs d'upstream (types, encodage URL, compositions toutes faites)

**Files:**
- Create: `src/lib/chart-types.ts` (copie de `upstream/main:src/lib/chart-types.ts`, commentaires traduits)
- Create: `src/lib/chart-encoding.ts` (copie de `upstream/main:src/lib/chart-encoding.ts`, imports `$lib`)
- Create: `src/lib/chart-presets.ts` (adapté, voir étapes)
- Test: `src/lib/tests/chart-encoding.test.ts` (copie upstream, imports `$lib`)
- Test: `src/lib/tests/chart-presets.test.ts` (copie upstream **sans** le `describe('popularVariables')`, + tests ci-dessous)

**Interfaces:**
- Produces: types `ChartSource`, `ChartPreset` (champs inchangés d'upstream). `ChartState` et `SavedChart` d'upstream ne sont **pas** portés (remplacés par `Composition` / `SavedComposition`, Task 2).
- Produces: `serializeSources(sources: ChartSource[]): string`, `parseSources(raw: string): ChartSource[] | undefined`, `sourcesEqual(a, b): boolean`, `cloneSources(sources): ChartSource[]` (signatures upstream). `matchPreset` d'upstream est **retiré** (remplacé par `matchPresetComposition`, Task 2).
- Produces: `chartPresets: ChartPreset[]`, `getChartPreset(id: string): ChartPreset | undefined`, `PRESET_GROUP_ORDER: readonly string[]`.

- [ ] **Step 1 : Créer la branche**

```bash
git switch main && git pull && git switch -c feat/compositions
git fetch upstream main   # remote déjà configuré (open-meteo/maps)
```

- [ ] **Step 2 : Copier les tests upstream et écrire les tests propres à nos compositions**

Copier `upstream/main:src/lib/tests/chart-encoding.test.ts` (retirer le `describe('matchPreset')` et le test « round-trips every preset … re-matches its preset », qui dépendent de `matchPreset`) et `chart-presets.test.ts` (sans `popularVariables`). Ajouter à `chart-presets.test.ts` :

```ts
it('libellés, descriptions et groupes en français', () => {
	for (const preset of chartPresets) {
		expect(preset.label, preset.id).not.toMatch(/\b(Temperature|Wind|Pressure|Cloud|Precip)\b/);
		expect(PRESET_GROUP_ORDER, preset.id).toContain(preset.group);
	}
});

it('chaque composition round-trip via serializeSources/parseSources', () => {
	for (const preset of chartPresets) {
		expect(parseSources(serializeSources(preset.sources)), preset.id).toEqual(preset.sources);
	}
});

it('contient les compositions Infoclimat', () => {
	expect(getChartPreset('thetaw850_z500')?.sources.map((s) => s.variable)).toEqual([
		'theta_w_850hPa',
		'geopotential_height_500hPa'
	]);
	expect(getChartPreset('thickness_mslp')?.sources.map((s) => s.variable)).toEqual([
		'thickness_500_1000hPa',
		'pressure_msl'
	]);
});
```

- [ ] **Step 3 : Lancer les tests, vérifier l'échec**

Run: `npx vitest run src/lib/tests/chart-encoding.test.ts src/lib/tests/chart-presets.test.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 4 : Créer `chart-types.ts` et `chart-encoding.ts`**

Copies upstream, imports `$lib/…`, commentaires en français. Dans `chart-encoding.ts`, supprimer `matchPreset` et l'import de `chartPresets` (le module ne dépend plus des presets).

- [ ] **Step 5 : Créer `chart-presets.ts`**

Reprendre les 22 compositions d'upstream (mêmes `id`, `sources` et valeurs, y compris `contourInterval`, `opacity`, `inlineVectors`), avec libellés et descriptions en français. Groupes : `'Synoptique'` (ex-« Synoptic »), `'Surface'`, `'Précipitations'` (ex-« Precipitation »), plus le nouveau groupe `'Infoclimat'` ; `PRESET_GROUP_ORDER = ['Synoptique', 'Surface', 'Précipitations', 'Infoclimat']`. Ne pas porter `PopularVariable` / `popularVariables`. Ajouter au groupe `'Infoclimat'` :
- `thetaw850_z500` — « θ'w 850 hPa + géopotentiel 500 hPa » : `[{ variable: 'theta_w_850hPa', raster: true }, { variable: 'geopotential_height_500hPa', contours: true, contourInterval: 12.5 }]`
- `thickness_mslp` — « Épaisseur 500/1000 hPa + pression mer » : `[{ variable: 'thickness_500_1000hPa', raster: true }, { variable: 'pressure_msl', contours: true, contourInterval: 2 }]`

- [ ] **Step 6 : Lancer les tests, vérifier qu'ils passent**

Run: `npx vitest run src/lib/tests/chart-encoding.test.ts src/lib/tests/chart-presets.test.ts`
Expected: PASS.

- [ ] **Step 7 : Commit**

```bash
git add src/lib/chart-types.ts src/lib/chart-encoding.ts src/lib/chart-presets.ts src/lib/tests/chart-encoding.test.ts src/lib/tests/chart-presets.test.ts
git commit -m "feat(compositions): porte les types, l'encodage URL et les compositions d'open-meteo/maps"
```

---

### Task 2 : Modèle de composition (fond + superpositions), logique pure

**Files:**
- Create: `src/lib/composition.ts`
- Test: `src/lib/tests/composition.test.ts`

**Interfaces:**
- Consumes: `ChartSource`, `ChartPreset`, `sourcesEqual`, `cloneSources`, `chartPresets` (Task 1) ; `variableHasDirections`, `variableAvailable` de `@openmeteo/weather-map-layer`.
- Produces :
  - `interface Composition { variable: string; overlays: ChartSource[] }`
  - `interface SavedComposition { id: string; name: string; composition: Composition; createdAt: number }`
  - `splitChartSources(sources: ChartSource[]): Composition` : fond = première source avec `raster` (à défaut la première source) ; ses `contours`/`arrows`/`contourInterval` deviennent une superposition sans `raster`, en tête de liste, si l'un d'eux est actif ; les autres sources suivent dans l'ordre.
  - `compositionsEqual(a: Composition, b: Composition): boolean`
  - `matchPresetComposition(c: Composition): ChartPreset | undefined` (compare `splitChartSources(preset.sources)` à `c`)
  - `defaultOverlayFor(variable: string, arrowsEnabled: boolean): ChartSource` : `{ variable, arrows: true }` si `arrowsEnabled && variableHasDirections(variable)`, sinon `{ variable, contours: true }` (même logique que `addSource` d'upstream quand un aplat est déjà affiché).
  - `isSourceAvailable(source: ChartSource, metaVariables: readonly string[] | undefined): boolean` : `variableAvailable(source.variable, new Set(metaVariables))` ; `false` si `metaVariables` est `undefined`.
  - `effectiveOverlayFlags(source: ChartSource, ctx: { primary: string; primaryContours: boolean; primaryArrows: boolean; windArrowLevel: string | null }): { raster: boolean; contours: boolean; arrows: boolean }` : neutralise ce que le pipeline principal dessine déjà.

- [ ] **Step 1 : Écrire les tests**

```ts
describe('splitChartSources', () => {
	it('extrait le fond et garde le reste en superpositions', () => {
		expect(splitChartSources(getChartPreset('z500_t850')!.sources)).toEqual({
			variable: 'temperature_850hPa',
			overlays: [{ variable: 'geopotential_height_500hPa', contours: true, contourInterval: 12.5 }]
		});
	});
	it('reporte les isolignes du fond en superposition sans aplat', () => {
		expect(splitChartSources(getChartPreset('mslp')!.sources)).toEqual({
			variable: 'pressure_msl',
			overlays: [{ variable: 'pressure_msl', contours: true, contourInterval: 2 }]
		});
	});
	it('sans aucun aplat : la première source devient le fond', () => {
		const c = splitChartSources([{ variable: 'pressure_msl', contours: true }]);
		expect(c.variable).toBe('pressure_msl');
		expect(c.overlays).toEqual([{ variable: 'pressure_msl', contours: true }]);
	});
});

it('matchPresetComposition reconnaît une composition et rejette une variante', () => {
	const c = splitChartSources(getChartPreset('rain_mslp')!.sources);
	expect(matchPresetComposition(c)?.id).toBe('rain_mslp');
	expect(matchPresetComposition({ ...c, overlays: [] })).toBeUndefined();
});

it('defaultOverlayFor : flèches pour le vent, isolignes sinon', () => {
	expect(defaultOverlayFor('wind_u_component_850hPa', true)).toEqual({ variable: 'wind_u_component_850hPa', arrows: true });
	expect(defaultOverlayFor('wind_u_component_850hPa', false)).toEqual({ variable: 'wind_u_component_850hPa', contours: true });
	expect(defaultOverlayFor('pressure_msl', true)).toEqual({ variable: 'pressure_msl', contours: true });
});

it('isSourceAvailable : variable stockée, dérivée, absente, meta non chargé', () => {
	const meta = ['temperature_2m', 'wind_u_component_10m', 'wind_v_component_10m'];
	expect(isSourceAvailable({ variable: 'temperature_2m' }, meta)).toBe(true);
	expect(isSourceAvailable({ variable: 'pressure_msl' }, meta)).toBe(false);
	expect(isSourceAvailable({ variable: 'temperature_2m' }, undefined)).toBe(false);
});

describe('effectiveOverlayFlags', () => {
	const ctx = { primary: 'pressure_msl', primaryContours: true, primaryArrows: true, windArrowLevel: '10m' };
	it('neutralise aplat et isolignes déjà dessinés par le fond', () => {
		expect(effectiveOverlayFlags({ variable: 'pressure_msl', raster: true, contours: true }, ctx))
			.toEqual({ raster: false, contours: false, arrows: false });
	});
	it('garde les isolignes du fond quand le fond ne les dessine pas', () => {
		expect(effectiveOverlayFlags({ variable: 'pressure_msl', contours: true }, { ...ctx, primaryContours: false }))
			.toEqual({ raster: false, contours: true, arrows: false });
	});
	it('neutralise les flèches du niveau déjà rendu par l’overlay vent', () => {
		expect(effectiveOverlayFlags({ variable: 'wind_u_component_10m', arrows: true }, ctx).arrows).toBe(false);
		expect(effectiveOverlayFlags({ variable: 'wind_u_component_850hPa', arrows: true }, ctx).arrows).toBe(true);
	});
	it('ignore les flèches d’une variable sans direction', () => {
		expect(effectiveOverlayFlags({ variable: 'temperature_2m', arrows: true }, ctx).arrows).toBe(false);
	});
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run src/lib/tests/composition.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3 : Implémenter `src/lib/composition.ts`** selon les signatures ci-dessus.

Dans `effectiveOverlayFlags`, les flèches sont neutralisées si `primaryArrows && (source.variable === primary || source.variable === \`wind_u_component_${windArrowLevel}\`)`.

- [ ] **Step 4 : Lancer, vérifier que ça passe**

Run: `npx vitest run src/lib/tests/composition.test.ts`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/composition.ts src/lib/tests/composition.test.ts
git commit -m "feat(compositions): modèle fond + superpositions (logique pure)"
```

---

### Task 3 : Stores, actions et synchronisation URL

**Files:**
- Create: `src/lib/stores/composition.ts` (stores persistés uniquement, aucun import de `url.ts` ni `layers.ts`)
- Create: `src/lib/composition-actions.ts` (mutations + URL + rechargement des couches)
- Modify: `src/lib/url.ts` (`urlParamsToPreferences` lit `overlays`)
- Test: `src/lib/tests/composition-store.test.ts`

**Interfaces:**
- Consumes: Task 1 (`serializeSources`, `parseSources`, `getChartPreset`, `cloneSources`), Task 2 (`Composition`, `SavedComposition`, `splitChartSources`, `defaultOverlayFor`, `matchPresetComposition`, `compositionsEqual`).
- Produces (`stores/composition.ts`) :
  - `overlays = persisted<ChartSource[]>('composition-overlays', [])`
  - `savedCompositions = persisted<{ version: 1; compositions: SavedComposition[] }>('saved-compositions', { version: 1, compositions: [] })`
  - `activeComposition: Readable<Composition>` (dérivé de `variable` + `overlays`)
  - `activePresetId: Readable<string | undefined>` (via `matchPresetComposition`)
- Produces (`composition-actions.ts`), chacune met à jour `updateUrl('overlays', serializeSources(…), '')` puis appelle `changeOMfileURL()` :
  - `applyPreset(id: string): void`, `applySavedComposition(id: string): void` (règlent `variable` **et** `overlays`)
  - `addOverlay(variable: string): void` (ignore une variable déjà présente ; utilise `defaultOverlayFor(variable, get(vectorOptions).arrows)`)
  - `updateOverlay(index: number, patch: Partial<ChartSource>): void` (refuse un changement de variable qui crée un doublon)
  - `removeOverlay(index: number): void`, `clearOverlays(): void`
  - `saveCurrentComposition(name: string): void` (nom vide → no-op ; `id` = slug + `Date.now().toString(36)`, comme upstream `saveCurrentChart`)
  - `deleteSavedComposition(id: string): void`
- Produces (`url.ts`) : `urlParamsToPreferences` lit `overlays` : valeur valide → `overlays.set(parsed)` ; invalide → `toast('Paramètre « overlays » invalide, ignoré.')` et store inchangé ; absente mais store non vide → écrit le paramètre dans l'URL (même schéma que `variable2`).

- [ ] **Step 1 : Écrire les tests** (stores + actions ; mocker `$lib/layers` → `changeOMfileURL: vi.fn()` et `$lib/url` → `updateUrl: vi.fn()` avec `vi.mock`)

```ts
it('applyPreset règle le fond et les superpositions', () => {
	applyPreset('z500_t850');
	expect(get(variable)).toBe('temperature_850hPa');
	expect(get(overlays)).toEqual([{ variable: 'geopotential_height_500hPa', contours: true, contourInterval: 12.5 }]);
	expect(get(activePresetId)).toBe('z500_t850');
	expect(updateUrl).toHaveBeenCalledWith('overlays', 'geopotential_height_500hPa:c12.5', '');
});
it('changer la variable garde les superpositions, mais perd le libellé de la composition', () => {
	applyPreset('z500_t850');
	variable.set('temperature_2m');
	expect(get(overlays)).toHaveLength(1);
	expect(get(activePresetId)).toBeUndefined();
});
it('addOverlay ignore un doublon, removeOverlay retire', () => {
	clearOverlays();
	addOverlay('pressure_msl');
	addOverlay('pressure_msl');
	expect(get(overlays)).toEqual([{ variable: 'pressure_msl', contours: true }]);
	removeOverlay(0);
	expect(get(overlays)).toEqual([]);
});
it('updateOverlay refuse un doublon de variable', () => {
	clearOverlays();
	addOverlay('pressure_msl');
	addOverlay('geopotential_height_500hPa');
	updateOverlay(1, { variable: 'pressure_msl' });
	expect(get(overlays)[1].variable).toBe('geopotential_height_500hPa');
});
it('saveCurrentComposition ignore un nom vide et enregistre sinon', () => {
	saveCurrentComposition('   ');
	expect(get(savedCompositions).compositions).toHaveLength(0);
	saveCurrentComposition('Ma carte');
	expect(get(savedCompositions).compositions[0].name).toBe('Ma carte');
});
```

Ajouter dans `src/lib/tests/url-secondary.test.ts` (même harnais que les tests `variable2`) : `?overlays=pressure_msl:c2` → `overlays` vaut `[{ variable: 'pressure_msl', contours: true, contourInterval: 2 }]` ; `?overlays=%%%` → store inchangé et `toast` appelé.

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run src/lib/tests/composition-store.test.ts src/lib/tests/url-secondary.test.ts`
Expected: FAIL.

- [ ] **Step 3 : Implémenter `stores/composition.ts`, `composition-actions.ts` et la lecture de `overlays` dans `url.ts`**

- [ ] **Step 4 : Lancer, vérifier que ça passe, puis la suite complète**

Run: `npx vitest run`
Expected: PASS, aucun test existant modifié.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/stores/composition.ts src/lib/composition-actions.ts src/lib/url.ts src/lib/tests/composition-store.test.ts src/lib/tests/url-secondary.test.ts
git commit -m "feat(compositions): stores persistés, actions et paramètre d'URL overlays"
```

---

### Task 4 : Rendu des superpositions

**Files:**
- Modify: `src/lib/url.ts` : `VectorFlagOverride` gagne `intervals?: number | 'breakpoints'` ; nouvelle `getOverlayOmUrl(source: ChartSource, flags: { contours: boolean; arrows: boolean }): string | undefined`
- Create: `src/lib/overlay-stack.ts`
- Modify: `src/lib/layers.ts` (`addOmFileLayers`, `changeOMfileURL`, `reloadVectorStyle`)
- Test: `src/lib/tests/overlay-stack.test.ts`, `src/lib/tests/url-builder.test.ts` (ajouts)

**Interfaces:**
- Consumes: Task 2 (`effectiveOverlayFlags`, `isSourceAvailable`), Task 3 (`overlays`), `SlotManager` / `SlotLayer` (`slot-manager.ts`), builders de `vector-styles.ts` (`buildContourColorExpr`, `buildContourWidthExpr`, `buildContourLabelExpr`, `buildArrowColorExpr`, `buildArrowWidthExpr`), `resolveWindArrowLevel()` (`url.ts`).
- Produces (`url.ts`) : `getOverlayOmUrl` = `getOMUrlFor(source.variable, undefined, { grid: false, arrows: flags.arrows, contours: flags.contours, intervals: source.contourInterval ?? 'breakpoints' })` ; renvoie `undefined` sur `ANOMALY_DOMAIN`. Avec `intervals: 'breakpoints'`, aucun `&intervals=` n'est ajouté, quel que soit `vectorOptions.breakpoints`.
- Produces (`overlay-stack.ts`) :
  - `interface OverlayLayerPlan { key: string; kind: 'raster' | 'vector'; url: string; source: ChartSource; flags: { raster: boolean; contours: boolean; arrows: boolean } }` (`key` = `` `${index}:${variable}:${kind}` ``)
  - `desiredOverlayLayers(overlays: ChartSource[], ctx: { primary: string; primaryContours: boolean; primaryArrows: boolean; windArrowLevel: string | null; metaVariables: readonly string[] | undefined }, urlFor: typeof getOverlayOmUrl): OverlayLayerPlan[]` (pure : saute les sources indisponibles et celles qui ne dessinent plus rien après `effectiveOverlayFlags` ; un plan `raster` si `flags.raster`, un plan `vector` si `contours || arrows`)
  - `planOverlayUpdates(current: ReadonlyMap<string, string>, desired: OverlayLayerPlan[]): { update: OverlayLayerPlan[]; remove: string[] }` (pure : `current` = clé → URL active)
  - `class OverlayStack { constructor(map: maplibregl.Map, hooks: { onReady: () => void; onError: (mgr: SlotManager) => void; rasterBefore: () => string; vectorBefore: () => string }); sync(plans: OverlayLayerPlan[]): SlotManager[]; destroyAll(): void }`. `sync` détruit les clés retirées, crée les managers manquants (`clearOnError: true`, `deferCommit: true`, `removeDelayMs` 300 pour l'aplat, 250 pour le vecteur) et renvoie les managers à rattacher au groupe de commit. **Le groupe doit être démarré avant d'appeler `update()`**, donc `sync` ne lance pas les `update()` : il renvoie les paires, et `layers.ts` appelle `mgr.update('om://' + url)` après `beginCommitGroup`.
  - Couches : aplat `raster` avec opacité `getRasterOpacity() × (source.opacity ?? 1)`, inséré avant `BEFORE_LAYER_RASTER_SECONDARY` ; vecteur = isolignes `line` + étiquettes `symbol` (`buildContourLabelExpr(source.variable, unité de l'échelle, unités)`) si `contours`, flèches `line` sur `'wind-arrows'` si `arrows`, insérés avant `vectorBefore()`. `lineWidth` multiplie la largeur d'isoligne. `inlineVectors` est ignoré en v1 (documenter).
- Produces (`layers.ts`) : `addOmFileLayers` détruit puis recrée l'`OverlayStack` (rechargement de style) ; `addOmFileLayers` et `changeOMfileURL` ajoutent au groupe les managers renvoyés par `sync`, **après** les managers principaux et **avant** `beginCommitGroup`. `onError` → `dropFromGroup(mgr)`. `reloadVectorStyle` recharge aussi les managers vecteur des superpositions (comme l'`arrowManager`).

- [ ] **Step 1 : Écrire les tests**

```ts
// url-builder.test.ts
it('getOverlayOmUrl : isolignes à intervalle fixe, sans grille', () => {
	const url = getOverlayOmUrl({ variable: 'pressure_msl', contours: true, contourInterval: 2 }, { contours: true, arrows: false });
	expect(url).toContain('variable=pressure_msl');
	expect(url).toContain('&contours=true');
	expect(url).toContain('&intervals=2');
	expect(url).not.toContain('grid=true');
});
it('getOverlayOmUrl : isolignes sur les paliers de l’échelle → pas d’intervals', () => {
	vectorOptions.set({ ...defaultVectorOptions, breakpoints: false, contourInterval: 5 });
	expect(getOverlayOmUrl({ variable: 'pressure_msl', contours: true }, { contours: true, arrows: false })).not.toContain('intervals=');
});
it('getOverlayOmUrl : rien sur le domaine anomalie', () => {
	d.set(ANOMALY_DOMAIN);
	expect(getOverlayOmUrl({ variable: 'pressure_msl', contours: true }, { contours: true, arrows: false })).toBeUndefined();
});

// overlay-stack.test.ts
const ctx = { primary: 'temperature_850hPa', primaryContours: false, primaryArrows: false, windArrowLevel: null, metaVariables: ['temperature_850hPa', 'geopotential_height_500hPa', 'cloud_cover_low'] };
const urlFor = (s: ChartSource) => `u/${s.variable}`;
it('un plan vecteur pour des isolignes, un plan aplat pour un aplat', () => {
	expect(desiredOverlayLayers([{ variable: 'geopotential_height_500hPa', contours: true }, { variable: 'cloud_cover_low', raster: true }], ctx, urlFor).map((p) => p.key))
		.toEqual(['0:geopotential_height_500hPa:vector', '1:cloud_cover_low:raster']);
});
it('saute une superposition indisponible sur le domaine', () => {
	expect(desiredOverlayLayers([{ variable: 'pressure_msl', contours: true }], ctx, urlFor)).toEqual([]);
});
it('saute une superposition entièrement neutralisée par le fond', () => {
	expect(desiredOverlayLayers([{ variable: 'temperature_850hPa', raster: true }], ctx, urlFor)).toEqual([]);
});
it('planOverlayUpdates : ne recharge que ce qui change, retire le reste', () => {
	const desired = desiredOverlayLayers([{ variable: 'geopotential_height_500hPa', contours: true }], ctx, urlFor);
	const current = new Map([['0:geopotential_height_500hPa:vector', 'u/geopotential_height_500hPa'], ['1:cloud_cover_low:raster', 'u/x']]);
	expect(planOverlayUpdates(current, desired)).toEqual({ update: [], remove: ['1:cloud_cover_low:raster'] });
	expect(planOverlayUpdates(new Map(), desired).update).toHaveLength(1);
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run src/lib/tests/overlay-stack.test.ts src/lib/tests/url-builder.test.ts`
Expected: FAIL.

- [ ] **Step 3 : Implémenter `getOverlayOmUrl` et l'option `intervals`** dans `url.ts`.

- [ ] **Step 4 : Implémenter `overlay-stack.ts`** (fonctions pures + classe).

- [ ] **Step 5 : Brancher `OverlayStack` dans `layers.ts`.** `changeOMfileURL` recalcule le plan à chaque appel (les URL dépendent de l'échéance) ; le court-circuit `group.length === 0` reste valable. Ajouter un `$effect` (ou un abonnement dans `+page.svelte`, à côté des autres) qui appelle `changeOMfileURL()` quand `overlays` change. Les actions de la Task 3 l'appellent déjà ; l'effet couvre le chargement depuis l'URL et le changement de domaine.

- [ ] **Step 6 : Lancer toute la suite + typage**

Run: `npx vitest run && npm run check`
Expected: PASS ; `0 ERRORS`.

- [ ] **Step 7 : Commit**

```bash
git add src/lib/url.ts src/lib/overlay-stack.ts src/lib/layers.ts src/routes/+page.svelte src/lib/tests/overlay-stack.test.ts src/lib/tests/url-builder.test.ts
git commit -m "feat(compositions): rendu des superpositions via des SlotManager dédiés"
```

---

### Task 5 : Interface « Compositions » (barre latérale + mobile)

**Files:**
- Create: `src/lib/components/composition/composition-panel.svelte` (assemble les deux blocs)
- Create: `src/lib/components/composition/preset-list.svelte` (compositions toutes faites + enregistrées)
- Create: `src/lib/components/composition/composition-editor.svelte` (composition actuelle)
- Create: `src/lib/components/composition/overlay-variable-picker.svelte` (ajout d'une superposition)
- Modify: `src/lib/components/chrome/sidebar.svelte` (nouvelle section repliable « Compositions » entre « Calques » et « Affichage », même `sectionHeader`, fermée par défaut)
- Modify: `src/lib/components/chrome/mobile-dock.svelte:84` (`<CompositionPanel />` sous `<LayerList />`, avec un séparateur)
- Test: `src/lib/tests/composition-panel.test.ts` (logique de tri/regroupement extraite dans `src/lib/composition-list.ts` si non triviale)

**Interfaces:**
- Consumes: Task 1 (`chartPresets`, `PRESET_GROUP_ORDER`), Task 2 (`isSourceAvailable`, `splitChartSources`), Task 3 (stores et actions), `metaJson` (`stores/time.ts`), `buildVariableList` / `groupVariablesByCategory` (`layer-list.ts`), `translateVariableLabel` (`i18n/variables-fr.ts`), `variableHasDirections`.
- Produces: `groupPresets(presets: ChartPreset[], metaVariables: readonly string[] | undefined): { group: string; items: { preset: ChartPreset; available: boolean }[] }[]` dans `src/lib/composition-list.ts` (groupes dans l'ordre de `PRESET_GROUP_ORDER`, indisponibles en bas de groupe, comme `chart-list.svelte` d'upstream).

Comportement attendu (copie visible exacte) :
- **Liste** : titres de groupe repliables (état persisté `composition-groups-open`, comme upstream), composition active cochée (`activePresetId`), composition indisponible sur le domaine grisée et non cliquable avec le titre « Variables indisponibles sur ce modèle ». Groupe « Mes compositions » ouvert par défaut, avec une croix « Supprimer » par entrée.
- **Composition actuelle** :
  - ligne du fond (libellé traduit de `variable`, mention « fond », non supprimable) ;
  - une ligne par superposition : libellé traduit, boutons à bascule « Aplat », « Isolignes », « Flèches » (désactivé avec le titre « Pas de direction pour cette variable » si `!variableHasDirections`), champ d'intervalle (placeholder « auto », titre « Intervalle des isolignes (vide = paliers de l'échelle) »), bouton « Retirer » ;
  - une superposition indisponible est grisée, avec le titre « Indisponible sur ce modèle » ;
  - bouton « Ajouter une superposition » → picker (liste des variables du domaine, groupées comme « Calques », niveaux inclus) ;
  - champ « Nom » + bouton « Enregistrer » (désactivé si nom vide ou si aucune superposition) ;
  - bouton « Tout retirer » si au moins une superposition.
- Mêmes classes visuelles que `layer-list.svelte` (verre sombre, `text-sky-300` pour l'actif, cibles tactiles `min-h-11 md:min-h-9`).

- [ ] **Step 1 : Écrire le test de `groupPresets`**

```ts
it('ordonne les groupes et descend les indisponibles', () => {
	const groups = groupPresets(chartPresets, ['temperature_850hPa', 'geopotential_height_500hPa', 'pressure_msl', 'temperature_2m']);
	expect(groups.map((g) => g.group)).toEqual(PRESET_GROUP_ORDER.filter((g) => groups.some((x) => x.group === g)));
	const synoptique = groups.find((g) => g.group === 'Synoptique')!;
	expect(synoptique.items[0].available).toBe(true);
	expect(synoptique.items.at(-1)!.available).toBe(false);
});
it('meta non chargé : tout indisponible', () => {
	expect(groupPresets(chartPresets, undefined).every((g) => g.items.every((i) => !i.available))).toBe(true);
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec** — Run: `npx vitest run src/lib/tests/composition-panel.test.ts` → FAIL.

- [ ] **Step 3 : Implémenter `composition-list.ts`, puis les quatre composants et leur montage** (sidebar + mobile dock).

- [ ] **Step 4 : Lancer tests + typage** — Run: `npx vitest run && npm run check` → PASS, `0 ERRORS`.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/composition-list.ts src/lib/components/composition src/lib/components/chrome/sidebar.svelte src/lib/components/chrome/mobile-dock.svelte src/lib/tests/composition-panel.test.ts
git commit -m "feat(compositions): panneau Compositions (liste, éditeur, enregistrement)"
```

---

### Task 6 : Documentation et vérification de bout en bout

**Files:**
- Modify: `.claude/rules/architecture.md` (nouvelle section « Compositions (fond + superpositions) » : modèle additif, `OverlayStack`, règles de neutralisation, paramètre `overlays`, hors périmètre v1)
- Modify: `.claude/rules/components.md` (dossier `components/composition/`)
- Modify: `.claude/rules/stores.md` (`composition-overlays`, `saved-compositions`, `composition-groups-open`)
- Modify: `README.md` (section `## Architecture` : une ligne sur les compositions, portées d'open-meteo/maps #361)

- [ ] **Step 1 : Mettre à jour les quatre docs.**

- [ ] **Step 2 : Vérifications automatiques**

Run: `npm run check && npx vitest run && npm run build && npx prettier --check $(git diff --name-only main)`
Expected: `0 ERRORS`, tous les tests passent, build OK, Prettier OK sur les fichiers touchés.

- [ ] **Step 3 : Vérification manuelle** (`npm run dev`, puis http://localhost:5173/), chaque point devant être vrai :
  1. Sans superposition : carte, URL et popup identiques à `main`.
  2. ECMWF IFS, composition « T850 + géopotentiel 500 » : aplat T850 + isohypses étiquetées ; l'URL porte `overlays=geopotential_height_500hPa:c12.5`, et la recharger restaure la composition.
  3. Passer sur `arome_france_convection` : superposition grisée, aucune erreur console ; revenir : elle réapparaît.
  4. Composition « Pression mer + vent 850 » avec le réglage Flèches actif : pas de flèches en double.
  5. Lecture animée sur 6 échéances : fondu simultané fond + superpositions.
  6. Bascule « Mode sombre » : superpositions toujours là.
  7. Enregistrer « Ma carte », recharger la page, la réappliquer, la supprimer.
  8. Mobile (largeur 390 px) : panneau Compositions accessible dans l'onglet Calques.

- [ ] **Step 4 : Commit et PR**

```bash
git add .claude/rules README.md
git commit -m "docs(compositions): architecture, composants et stores"
git push -u origin feat/compositions
gh pr create --title "feat: compositions de cartes (superpositions, compositions toutes faites, enregistrement)" --body "…"
```
