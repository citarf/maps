import {
	LEVEL_PREFIX,
	LEVEL_REGEX,
	LEVEL_UNIT_REGEX,
	variableOptions
} from '@openmeteo/weather-map-layer';

import {
	HIDDEN_VARIABLES,
	NON_LEVEL_GROUP_VARIABLES,
	VISIBLE_PRESSURE_LEVELS_HPA
} from '$lib/constants';
import { sortLevels } from '$lib/level-groups';
import { CATEGORIES, type Category, categorize } from '$lib/variable-categories';

export interface VariableOption {
	value: string;
	label: string;
}

/**
 * Liste des variables affichables : groupes de niveaux repliés sur leur préfixe,
 * variables masquées (HIDDEN_VARIABLES) exclues. Logique extraite telle quelle
 * de l'ancien `variable-tabs.svelte`.
 */
export function buildVariableList(metaVariables: string[]): string[] {
	const variables: string[] = [];
	for (const mjVariable of metaVariables) {
		if (HIDDEN_VARIABLES.includes(mjVariable)) continue;
		// Variables autonomes que le LEVEL_PREFIX du package replierait à tort
		// (ex. `wind_chill_2m` → préfixe « wind ») : conservées telles quelles.
		if (mjVariable.match(LEVEL_REGEX) && !NON_LEVEL_GROUP_VARIABLES.includes(mjVariable)) {
			const prefix = mjVariable.match(LEVEL_PREFIX)?.groups?.prefix;
			if (prefix) {
				if (!variables.includes(prefix)) variables.push(prefix);
				continue;
			}
		}
		variables.push(mjVariable);
	}
	return variables;
}

/**
 * Groupes de niveaux : préfixe → options triées par altitude croissante.
 * Les niveaux hPa hors VISIBLE_PRESSURE_LEVELS_HPA sont filtrés (affichage
 * seulement) ; les hauteurs (m) passent toujours.
 */
export function buildLevelGroups(metaVariables: string[]): Record<string, VariableOption[]> {
	const visible = new Set<number>(VISIBLE_PRESSURE_LEVELS_HPA);
	const groups: Record<string, VariableOption[]> = {};
	for (const mjVariable of metaVariables) {
		// Cf. buildVariableList : ne jamais replier ces variables autonomes dans un
		// groupe de niveaux (sinon `wind_chill_2m` rejoint le sous-sélecteur « wind »).
		if (NON_LEVEL_GROUP_VARIABLES.includes(mjVariable)) continue;
		if (!mjVariable.match(LEVEL_REGEX)?.groups) continue;
		const prefix = mjVariable.match(LEVEL_PREFIX)?.groups?.prefix;
		if (!prefix) continue;
		const unitMatch = mjVariable.match(LEVEL_UNIT_REGEX);
		if (unitMatch?.groups?.unit === 'hPa' && !visible.has(Number(unitMatch.groups.level))) {
			continue;
		}
		const option = variableOptions.find(({ value }) => value === mjVariable) ?? {
			value: mjVariable,
			label: mjVariable
		};
		(groups[prefix] ??= []).push(option);
	}
	for (const prefix of Object.keys(groups)) {
		groups[prefix] = sortLevels(groups[prefix]);
	}
	return groups;
}

/**
 * Variables groupées par catégorie (ordre = CATEGORIES) ; composantes `_v_`
 * et `_direction` exclues (dérivées, jamais affichées directement).
 */
export function groupVariablesByCategory(list: string[]): { cat: Category; items: string[] }[] {
	const groups: { cat: Category; items: string[] }[] = [];
	for (const cat of CATEGORIES) {
		const items = list.filter(
			(v) => !v.includes('_v_') && !v.includes('_direction') && categorize(v) === cat.key
		);
		if (items.length) groups.push({ cat, items });
	}
	return groups;
}

/** Minuscules sans diacritiques : « Précip » trouve « precipitations ». */
export function normalizeSearch(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.trim();
}

/**
 * Filtre les variables par libellé (FR) ou identifiant technique, tous mots
 * requis, insensible aux accents. Requête vide → liste inchangée.
 */
export function searchVariables(
	list: string[],
	query: string,
	labelOf: (value: string) => string
): string[] {
	const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
	if (!terms.length) return list;
	return list.filter((value) => {
		const haystack = normalizeSearch(`${labelOf(value)} ${value.replaceAll('_', ' ')}`);
		return terms.every((term) => haystack.includes(term));
	});
}

/** Libellé court d'un niveau pour une puce (`temperature_500hPa` → « 500 hPa »). */
export function shortLevelLabel(value: string, fallback: string): string {
	const groups = value.match(LEVEL_UNIT_REGEX)?.groups;
	return groups?.level && groups?.unit ? `${groups.level} ${groups.unit}` : fallback;
}
