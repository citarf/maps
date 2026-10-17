---
description: Svelte stores, persisted state, and URL ↔ store sync
paths:
  - 'src/lib/stores/**'
  - 'src/lib/url.ts'
  - 'src/lib/constants.ts'
---

# State (svelte stores)

All app state lives under `src/lib/stores/` as svelte stores. Many are `persisted(...)` from `svelte-persisted-store` (localStorage-backed): `preferences`, `tileSize`, `opacity`, `cacheBlockSizeKb`, `cacheMaxBytesMb`, `customColorScales`, units, etc. `localStorageVersion` is compared against `package.json` version on mount; when it changes, `resetStates()` in `preferences.ts` wipes all persisted state — bump the package version when introducing breaking state shape changes.

`sidebarCollapsed` (persisté) mémorise le repli de la sidebar desktop ; `sidebarTab` (persisté, `'layers' | 'compositions' | 'map'`) l'onglet actif, partagé sidebar desktop / bottom-sheet mobile ; `sidebarWidth` (writable non persisté, `preferences.ts`) publie la largeur occupée par la sidebar (0 quand démontée — mobile) et sert à décaler timeline et légende.

`src/lib/stores/sounding.ts` gère l'état du panel de sondage vertical (`open`, `lat`, `lng`, `activeTab`). Ce store n'est ni persisté ni synchronisé dans l'URL (MVP) — l'état est perdu au rechargement de page.

`src/lib/stores/point-workspace.ts` (`pointWorkspace : { open, lat, lng }`) pilote le tiroir « espace point » (meteogram) sur le même schéma que `sounding.ts` : `open(lat, lng)`/`close()`, ni persisté ni dans l'URL (MVP, état perdu au rechargement). Ouvert depuis le bouton « Meteogram » du popup (`popup.ts`), consommé par `components/point-workspace/point-drawer.svelte`.

`src/lib/stores/composition.ts` porte l'état des compositions : `overlays` (persisté `composition-overlays`, `ChartSource[]` empilées sur le fond ; synchronisé dans l'URL via le paramètre `overlays`, l'URL prime au chargement), `savedCompositions` (persisté `saved-compositions`, `{ version: 1, compositions: SavedComposition[] }` — le champ `version` prépare de futures migrations) et deux `derived` : `activeComposition` (`{ variable, overlays }`) et `activePresetId` (preset correspondant exactement, via `matchPresetComposition`). Le groupe replié/déplié du panneau est mémorisé dans `composition-groups-open` (persisté, déclaré localement dans `components/composition/preset-list.svelte`). Les mutations passent par `composition-actions.ts`, jamais directement depuis les composants ; `+page.svelte` appelle `changeOMfileURL()` quand `overlays` change. Changer la forme de ces états persistés impose le bump de version de `package.json` (voir `resetStates()`). `resetStates()` (« Réinitialiser » et bump de version) vide `overlays` mais **conserve `savedCompositions`** (données utilisateur). À la lecture du localStorage, `overlays` est normalisé par `normalizeOverlays` (`beforeRead` : aller-retour `serializeSources`/`parseSources`, doublons fusionnés, repli sur `[]` si une entrée est corrompue).

`src/lib/stores/basemap-theme.ts` (`basemapTheme: 'light' | 'dark'`, persisté) pilote **uniquement le fond de carte** MapLibre, découplé du thème du chrome. Le **chrome** (barre, panneaux, dropdowns) reste un overlay verre dépoli **sombre en permanence** : `+layout.svelte` force le dark mode (`setMode('dark')` + `<ModeWatcher defaultMode="dark" track={false} />`), ce qui garde la classe `.dark` et tous les tokens/variantes `dark:` actifs quel que soit le fond de carte. `mode.current` (mode-watcher) ne sert donc plus à choisir le basemap. `getStyle()` (`map-controls.ts`) lit `basemapTheme` ; le toggle « Fond sombre » (`display-section.svelte`) le pilote ; un `$effect` dans `+page.svelte` appelle `reloadStyles()` à chaque changement (re-style basemap + ré-ajout des couches `om://`). Défaut = **clair** (le mode sombre est opt-in via le toggle ; on ne suit plus `prefers-color-scheme` de l'OS), puis choix persisté et prioritaire. Ne pas remettre le chrome sur un thème adaptatif : de nombreux composants codent `text-white`/`bg-glass`/variantes `dark:` en dur.

URL ↔ store sync is centralized in `src/lib/url.ts`:

- `urlParamsToPreferences()` runs on mount to hydrate stores from query params.
- `updateUrl(param, value)` is called from store subscriptions / event handlers; it omits params equal to defaults (defined in `COMPLETE_DEFAULT_VALUES` in `constants.ts`).
- The MapLibre `_hash` (zoom/center) is appended back into the URL.
