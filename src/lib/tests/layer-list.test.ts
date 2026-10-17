import { LEVEL_PREFIX } from '@openmeteo/weather-map-layer';
import { describe, expect, it } from 'vitest';

import {
	buildLevelGroups,
	buildVariableList,
	groupVariablesByCategory,
	searchVariables,
	shortLevelLabel
} from '$lib/layer-list';

// Échantillon réaliste : surface, cumul, variable masquée, groupe de niveaux
// (2 m + hPa dont un hors whitelist), composantes vent.
const META_VARIABLES = [
	'temperature_2m',
	'precipitation',
	'precipitation_type', // HIDDEN_VARIABLES
	'temperature_850hPa',
	'temperature_500hPa',
	'temperature_150hPa' // hors VISIBLE_PRESSURE_LEVELS_HPA (1000…200)
];

// Préfixe de groupe calculé par la même regex que le runtime (contrat de pliage).
const TEMP_PREFIX = 'temperature_850hPa'.match(LEVEL_PREFIX)!.groups!.prefix!;

describe('buildVariableList', () => {
	it('plie les niveaux sur leur préfixe, exclut les variables masquées', () => {
		const list = buildVariableList([...META_VARIABLES]);
		expect(list).toContain('precipitation');
		expect(list).not.toContain('precipitation_type');
		// un seul item pour tout le groupe température, pas les niveaux individuels
		expect(list.filter((v) => v.startsWith('temperature'))).toEqual([TEMP_PREFIX]);
	});

	it('ne replie jamais les variables autonomes (NON_LEVEL_GROUP_VARIABLES)', () => {
		// wind_chill_2m serait capturé par le préfixe « wind » du package (fix PR #109).
		const list = buildVariableList(['wind_chill_2m', 'wind_speed_10m']);
		expect(list).toContain('wind_chill_2m');
	});
});

describe('buildLevelGroups', () => {
	it('filtre les hPa hors whitelist et trie par altitude croissante', () => {
		const groups = buildLevelGroups([...META_VARIABLES]);
		const values = groups[TEMP_PREFIX].map((o) => o.value);
		expect(values).toContain('temperature_850hPa');
		expect(values).toContain('temperature_500hPa');
		expect(values).not.toContain('temperature_150hPa');
		// altitude croissante : 2 m < 850 hPa < 500 hPa
		expect(values.indexOf('temperature_2m')).toBeLessThan(values.indexOf('temperature_850hPa'));
		expect(values.indexOf('temperature_850hPa')).toBeLessThan(values.indexOf('temperature_500hPa'));
	});

	it('exclut les variables autonomes des groupes de niveaux', () => {
		const groups = buildLevelGroups(['wind_chill_2m', 'wind_speed_10m']);
		for (const values of Object.values(groups)) {
			expect(values.map((o) => o.value)).not.toContain('wind_chill_2m');
		}
	});
});

describe('groupVariablesByCategory', () => {
	it('groupe par catégorie et exclut composantes _v_ et directions', () => {
		const grouped = groupVariablesByCategory([
			'temperature_2m',
			'precipitation',
			'wind_v_component_10m',
			'wind_direction_10m'
		]);
		const all = grouped.flatMap((g) => g.items);
		expect(all).not.toContain('wind_v_component_10m');
		expect(all).not.toContain('wind_direction_10m');
		expect(grouped.find((g) => g.cat.key === 'temperature')?.items).toContain('temperature_2m');
		expect(grouped.find((g) => g.cat.key === 'precipitation')?.items).toContain('precipitation');
	});
});

describe('searchVariables', () => {
	const labels: Record<string, string> = {
		temperature_2m: 'Température 2 m',
		precipitation: 'Précipitations',
		wind_gusts_10m: 'Rafales de vent 10 m'
	};
	const list = Object.keys(labels);
	const labelOf = (v: string) => labels[v];

	it('renvoie la liste telle quelle pour une requête vide', () => {
		expect(searchVariables(list, '  ', labelOf)).toEqual(list);
	});

	it('ignore accents et casse', () => {
		expect(searchVariables(list, 'PRECIP', labelOf)).toEqual(['precipitation']);
		expect(searchVariables(list, 'température', labelOf)).toEqual(['temperature_2m']);
	});

	it("cherche aussi dans l'identifiant technique", () => {
		expect(searchVariables(list, 'gusts', labelOf)).toEqual(['wind_gusts_10m']);
	});

	it('exige tous les mots', () => {
		expect(searchVariables(list, 'vent 10', labelOf)).toEqual(['wind_gusts_10m']);
		expect(searchVariables(list, 'vent 2', labelOf)).toEqual([]);
	});
});

describe('shortLevelLabel', () => {
	it('extrait niveau + unité', () => {
		expect(shortLevelLabel('temperature_500hPa', 'x')).toBe('500 hPa');
		expect(shortLevelLabel('temperature_2m', 'x')).toBe('2 m');
	});

	it('retombe sur le libellé fourni sans niveau', () => {
		expect(shortLevelLabel('precipitation', 'Précipitations')).toBe('Précipitations');
	});
});
