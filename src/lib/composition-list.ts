/**
 * Logique pure du panneau « Compositions » : regroupement des compositions
 * toutes faites, disponibilité selon le modèle, pas de l'intervalle des
 * isolignes. Portage de `chart-list.svelte` / `chart-editor.svelte` d'upstream.
 */
import { LEVEL_UNIT_REGEX, variableOptions } from '@openmeteo/weather-map-layer';

import { PRESET_GROUP_ORDER } from '$lib/chart-presets';
import { isSourceAvailable } from '$lib/composition';
import { translateVariableLabel } from '$lib/i18n/variables-fr';
import { buildLevelGroups } from '$lib/layer-list';

import type { ChartPreset } from '$lib/chart-types';
import type { SavedComposition } from '$lib/composition';

/** Groupe des presets sans groupe déclaré. */
const DEFAULT_GROUP = 'Autres';

export interface PresetGroup {
	group: string;
	items: { preset: ChartPreset; available: boolean }[];
}

/** Les indisponibles descendent en bas de liste (tri stable). */
const availableFirst = <T extends { available: boolean }>(items: T[]): T[] =>
	items.sort((a, b) => Number(b.available) - Number(a.available));

/**
 * Presets regroupés dans l'ordre de `PRESET_GROUP_ORDER` (groupes inconnus
 * ensuite, dans l'ordre d'apparition). Un preset est disponible si le modèle
 * fournit toutes ses variables ; meta non chargé = tout indisponible.
 */
export const groupPresets = (
	presets: ChartPreset[],
	metaVariables: readonly string[] | undefined
): PresetGroup[] => {
	const groups: PresetGroup[] = [];
	for (const preset of presets) {
		const available = preset.sources.every((s) => isSourceAvailable(s, metaVariables));
		const name = preset.group ?? DEFAULT_GROUP;
		const group = groups.find((g) => g.group === name);
		if (group) group.items.push({ preset, available });
		else groups.push({ group: name, items: [{ preset, available }] });
	}
	const rank = (name: string): number => {
		const i = PRESET_GROUP_ORDER.indexOf(name);
		return i === -1 ? PRESET_GROUP_ORDER.length : i;
	};
	groups.sort((a, b) => rank(a.group) - rank(b.group));
	for (const group of groups) availableFirst(group.items);
	return groups;
};

/** Compositions enregistrées avec leur disponibilité (fond + superpositions), indisponibles en bas. */
export const savedCompositionEntries = (
	compositions: SavedComposition[],
	metaVariables: readonly string[] | undefined
): { saved: SavedComposition; available: boolean }[] =>
	availableFirst(
		compositions.map((saved) => ({
			saved,
			available: [{ variable: saved.composition.variable }, ...saved.composition.overlays].every(
				(s) => isSourceAvailable(s, metaVariables)
			)
		}))
	);

/** Libellé français d'une variable (identifiant complet, niveau inclus). */
export const variableLabel = (variable: string): string =>
	translateVariableLabel(variableOptions.find((o) => o.value === variable)?.label ?? variable);

/**
 * Pas de l'intervalle des isolignes aux flèches haut/bas : entiers au-dessus
 * de 3, demis jusqu'à 1, quarts en dessous, plancher 0,25 (des valeurs plus
 * fines, jusqu'à 0,1, restent saisissables au clavier).
 */
export const stepInterval = (current: number, up: boolean): number => {
	const next = up
		? current >= 3
			? current + 1
			: current >= 1
				? current + 0.5
				: current + 0.25
		: current > 3
			? current - 1
			: current > 1
				? current - 0.5
				: current - 0.25;
	return Math.max(0.25, Math.round(next * 100) / 100);
};

/** Saisie libre de l'intervalle : vide/invalide = auto (paliers de l'échelle), plancher 0,1. */
export const parseInterval = (raw: string): number | undefined => {
	const parsed = Number(raw);
	return raw.trim() === '' || !isFinite(parsed) || parsed <= 0 ? undefined : Math.max(0.1, parsed);
};

/**
 * Niveaux proposés pour changer celui d'une superposition (portage de
 * `source-level-select.svelte` d'upstream) : les variables du même groupe de
 * niveaux que `variable` dans le modèle courant, libellées « 850 hPa », « 2 m ».
 * Les composantes `v` et les directions du vent sont exclues, comme dans
 * « Calques ». Liste vide s'il n'y a pas d'autre niveau à proposer.
 */
export const overlayLevelOptions = (
	variable: string,
	metaVariables: readonly string[] | undefined
): { value: string; label: string }[] => {
	if (!metaVariables) return [];
	const group = Object.values(buildLevelGroups([...metaVariables])).find((options) =>
		options.some(({ value }) => value === variable)
	);
	const options = (group ?? [])
		.filter(({ value }) => !value.includes('v_component') && !value.includes('_direction'))
		.map(({ value }) => {
			const level = value.match(LEVEL_UNIT_REGEX)?.groups;
			return { value, label: level ? `${level.level} ${level.unit}` : value };
		});
	return options.length > 1 ? options : [];
};
