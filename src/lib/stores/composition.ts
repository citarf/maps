import { derived } from 'svelte/store';

import { persisted } from 'svelte-persisted-store';

import { variable } from '$lib/stores/variables';

import { parseSources, serializeSources } from '$lib/chart-encoding';
import { matchPresetComposition } from '$lib/composition';

import type { ChartSource } from '$lib/chart-types';
import type { Composition, SavedComposition } from '$lib/composition';

/**
 * Normalise des superpositions lues du localStorage : un aller-retour par
 * l'encodage URL valide chaque entrée et fusionne les variables en double
 * (sinon `{#each … (source.variable)}` lèverait `each_key_duplicate`). Toute
 * entrée corrompue fait retomber sur une liste vide.
 */
export const normalizeOverlays = (value: unknown): ChartSource[] => {
	try {
		if (!Array.isArray(value) || value.length === 0) return [];
		const valid = value.every(
			(s) => typeof s === 'object' && s !== null && typeof s.variable === 'string'
		);
		if (!valid) return [];
		return parseSources(serializeSources(value as ChartSource[])) ?? [];
	} catch {
		return [];
	}
};

/** Superpositions (isolignes, flèches) empilées sur le fond (la variable principale). */
export const overlays = persisted<ChartSource[]>('composition-overlays', [], {
	beforeRead: normalizeOverlays
});

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
