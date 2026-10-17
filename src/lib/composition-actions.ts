/**
 * Mutations des compositions : mettent à jour les stores, le paramètre d'URL
 * `overlays`, puis rechargent les couches. Séparé de `stores/composition.ts`
 * pour éviter un cycle d'imports (`url.ts` importe le store).
 */
import { get } from 'svelte/store';

import { overlays, savedCompositions } from '$lib/stores/composition';
import { variable } from '$lib/stores/variables';
import { vectorOptions } from '$lib/stores/vector';

import { cloneSources, serializeSources } from '$lib/chart-encoding';
import { getChartPreset } from '$lib/chart-presets';
import { defaultOverlayFor, splitChartSources } from '$lib/composition';
import { changeOMfileURL } from '$lib/layers';
import { updateUrl } from '$lib/url';

import type { ChartSource } from '$lib/chart-types';
import type { Composition } from '$lib/composition';

/** Écrit les superpositions dans l'URL puis recharge les couches. */
const commitOverlays = (): void => {
	updateUrl('overlays', serializeSources(get(overlays)), '');
	changeOMfileURL();
};

const setComposition = (composition: Composition): void => {
	variable.set(composition.variable);
	overlays.set(cloneSources(composition.overlays));
	updateUrl('variable', composition.variable);
	commitOverlays();
};

export const applyPreset = (id: string): void => {
	const preset = getChartPreset(id);
	if (!preset) return;
	setComposition(splitChartSources(preset.sources));
};

export const applySavedComposition = (id: string): void => {
	const saved = get(savedCompositions).compositions.find((c) => c.id === id);
	if (!saved) return;
	setComposition(saved.composition);
};

export const addOverlay = (name: string): void => {
	if (get(overlays).some((o) => o.variable === name)) return;
	overlays.update((list) => [...list, defaultOverlayFor(name, get(vectorOptions).arrows)]);
	commitOverlays();
};

export const updateOverlay = (index: number, patch: Partial<ChartSource>): void => {
	const list = get(overlays);
	const current = list[index];
	if (!current) return;
	if (
		patch.variable !== undefined &&
		list.some((o, i) => i !== index && o.variable === patch.variable)
	) {
		return;
	}
	overlays.set(list.map((o, i) => (i === index ? { ...o, ...patch } : o)));
	commitOverlays();
};

export const removeOverlay = (index: number): void => {
	overlays.update((list) => list.filter((_, i) => i !== index));
	commitOverlays();
};

export const clearOverlays = (): void => {
	overlays.set([]);
	commitOverlays();
};

export const saveCurrentComposition = (name: string): void => {
	const trimmed = name.trim();
	if (!trimmed) return;
	const slug = trimmed
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	const id = `${slug}-${Date.now().toString(36)}`;
	savedCompositions.update((store) => ({
		...store,
		compositions: [
			...store.compositions,
			{
				id,
				name: trimmed,
				composition: { variable: get(variable), overlays: cloneSources(get(overlays)) },
				createdAt: Date.now()
			}
		]
	}));
};

export const deleteSavedComposition = (id: string): void => {
	savedCompositions.update((store) => ({
		...store,
		compositions: store.compositions.filter((c) => c.id !== id)
	}));
};
