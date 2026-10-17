import { get } from 'svelte/store';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
	activePresetId,
	normalizeOverlays,
	overlays,
	savedCompositions
} from '$lib/stores/composition';
import { variable } from '$lib/stores/variables';

import {
	addOverlay,
	applyPreset,
	applySavedComposition,
	clearOverlays,
	deleteSavedComposition,
	removeOverlay,
	saveCurrentComposition,
	updateOverlay
} from '$lib/composition-actions';
import { updateUrl } from '$lib/url';

vi.mock('$lib/layers', () => ({ changeOMfileURL: vi.fn() }));
vi.mock('$lib/url', () => ({ updateUrl: vi.fn() }));

describe('actions de composition', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		variable.set('temperature_2m');
		overlays.set([]);
		savedCompositions.set({ version: 1, compositions: [] });
	});

	it('applyPreset règle le fond et les superpositions', () => {
		applyPreset('z500_t850');
		expect(get(variable)).toBe('temperature_850hPa');
		expect(get(overlays)).toEqual([
			{ variable: 'geopotential_height_500hPa', contours: true, contourInterval: 12.5 }
		]);
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

	it('applySavedComposition restaure puis deleteSavedComposition supprime', () => {
		addOverlay('pressure_msl');
		saveCurrentComposition('Ma carte');
		const { id } = get(savedCompositions).compositions[0];
		expect(id).toMatch(/^ma-carte-/);
		clearOverlays();
		variable.set('wind_speed_10m');
		applySavedComposition(id);
		expect(get(variable)).toBe('temperature_2m');
		expect(get(overlays)).toEqual([{ variable: 'pressure_msl', contours: true }]);
		deleteSavedComposition(id);
		expect(get(savedCompositions).compositions).toHaveLength(0);
	});
});

describe('normalizeOverlays (lecture du localStorage)', () => {
	it('garde une liste valide telle quelle', () => {
		const list = [{ variable: 'pressure_msl', contours: true, contourInterval: 4 }];
		expect(normalizeOverlays(list)).toEqual(list);
	});

	it('fusionne les variables en double', () => {
		expect(
			normalizeOverlays([
				{ variable: 'pressure_msl', contours: true },
				{ variable: 'pressure_msl', arrows: true }
			])
		).toEqual([{ variable: 'pressure_msl', contours: true, arrows: true }]);
	});

	it('retombe sur [] pour une valeur corrompue', () => {
		expect(normalizeOverlays(null)).toEqual([]);
		expect(normalizeOverlays('x')).toEqual([]);
		expect(normalizeOverlays([null])).toEqual([]);
		expect(normalizeOverlays([{ contours: true }])).toEqual([]);
		expect(normalizeOverlays([{ variable: 'bad var!', contours: true }])).toEqual([]);
		expect(normalizeOverlays([{ variable: 'pressure_msl', opacity: 'x' }])).toEqual([]);
	});
});
