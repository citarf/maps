import { derived } from 'svelte/store';

import { persisted } from 'svelte-persisted-store';

import { variable } from '$lib/stores/variables';

import { matchPresetComposition } from '$lib/composition';

import type { ChartSource } from '$lib/chart-types';
import type { Composition, SavedComposition } from '$lib/composition';

/** Superpositions (isolignes, flèches) empilées sur le fond (la variable principale). */
export const overlays = persisted<ChartSource[]>('composition-overlays', []);

/** Compositions enregistrées par l'utilisateur (versionnées pour migrations futures). */
export const savedCompositions = persisted<{ version: 1; compositions: SavedComposition[] }>(
	'saved-compositions',
	{ version: 1, compositions: [] }
);

/** Composition courante : fond + superpositions. */
export const activeComposition = derived(
	[variable, overlays],
	([$variable, $overlays]): Composition => ({ variable: $variable, overlays: $overlays })
);

/** Identifiant du preset correspondant exactement à la composition courante. */
export const activePresetId = derived(
	activeComposition,
	($composition): string | undefined => matchPresetComposition($composition)?.id
);
