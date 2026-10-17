import { describe, expect, it } from 'vitest';

import { PRESET_GROUP_ORDER, chartPresets } from '$lib/chart-presets';
import {
	groupPresets,
	parseInterval,
	savedCompositionEntries,
	stepInterval,
	variableLabel
} from '$lib/composition-list';

import type { SavedComposition } from '$lib/composition';

describe('groupPresets', () => {
	it('ordonne les groupes et descend les indisponibles', () => {
		const groups = groupPresets(chartPresets, [
			'temperature_850hPa',
			'geopotential_height_500hPa',
			'pressure_msl',
			'temperature_2m'
		]);
		expect(groups.map((g) => g.group)).toEqual(
			PRESET_GROUP_ORDER.filter((g) => groups.some((x) => x.group === g))
		);
		const synoptique = groups.find((g) => g.group === 'Synoptique')!;
		expect(synoptique.items[0].available).toBe(true);
		expect(synoptique.items.at(-1)!.available).toBe(false);
	});
	it('meta non chargé : tout indisponible', () => {
		expect(
			groupPresets(chartPresets, undefined).every((g) => g.items.every((i) => !i.available))
		).toBe(true);
	});
	it('conserve l’ordre des presets au sein des disponibles', () => {
		const groups = groupPresets(chartPresets, undefined);
		const synoptique = groups.find((g) => g.group === 'Synoptique')!;
		expect(synoptique.items.map((i) => i.preset.id)).toEqual(
			chartPresets.filter((p) => p.group === 'Synoptique').map((p) => p.id)
		);
	});
	it('groupe inconnu rangé après les groupes ordonnés', () => {
		const groups = groupPresets(
			[
				{ id: 'x', label: 'X', group: 'Autre', sources: [{ variable: 'pressure_msl' }] },
				{ id: 'y', label: 'Y', group: 'Surface', sources: [{ variable: 'pressure_msl' }] }
			],
			['pressure_msl']
		);
		expect(groups.map((g) => g.group)).toEqual(['Surface', 'Autre']);
	});
});

describe('savedCompositionEntries', () => {
	const saved = (id: string, variable: string, overlay: string): SavedComposition => ({
		id,
		name: id,
		createdAt: 0,
		composition: { variable, overlays: [{ variable: overlay, contours: true }] }
	});
	it('fond et superpositions doivent être disponibles ; indisponibles en bas', () => {
		const entries = savedCompositionEntries(
			[
				saved('a', 'temperature_2m', 'cape'),
				saved('b', 'temperature_2m', 'pressure_msl'),
				saved('c', 'cape', 'pressure_msl')
			],
			['temperature_2m', 'pressure_msl']
		);
		expect(entries.map((e) => [e.saved.id, e.available])).toEqual([
			['b', true],
			['a', false],
			['c', false]
		]);
	});
});

describe('stepInterval', () => {
	it('entiers au-dessus de 3', () => {
		expect(stepInterval(3, true)).toBe(4);
		expect(stepInterval(4, false)).toBe(3);
	});
	it('demis entre 1 et 3', () => {
		expect(stepInterval(2, true)).toBe(2.5);
		expect(stepInterval(3, false)).toBe(2.5);
		expect(stepInterval(1, true)).toBe(1.5);
	});
	it('quarts en dessous de 1, plancher 0,25', () => {
		expect(stepInterval(0.5, true)).toBe(0.75);
		expect(stepInterval(1, false)).toBe(0.75);
		expect(stepInterval(0.25, false)).toBe(0.25);
		expect(stepInterval(0.1, false)).toBe(0.25);
	});
});

describe('parseInterval', () => {
	it('vide ou invalide = auto', () => {
		expect(parseInterval('')).toBeUndefined();
		expect(parseInterval('abc')).toBeUndefined();
		expect(parseInterval('0')).toBeUndefined();
		expect(parseInterval('-2')).toBeUndefined();
	});
	it('plancher 0,1 en saisie libre', () => {
		expect(parseInterval('0.05')).toBe(0.1);
		expect(parseInterval('0.1')).toBe(0.1);
		expect(parseInterval('12.5')).toBe(12.5);
	});
});

describe('variableLabel', () => {
	it('traduit le libellé de la variable', () => {
		expect(variableLabel('temperature_2m')).not.toBe('temperature_2m');
		expect(variableLabel('variable_inconnue')).toBe('variable_inconnue');
	});
});
