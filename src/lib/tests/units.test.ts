import { describe, expect, it } from 'vitest';

import {
	type UnitPreferences,
	convertGeopotential,
	convertValue,
	getDisplayUnit,
	getUnitCategory,
	getUnitOptions
} from '$lib/stores/units';

const prefs: UnitPreferences = {
	temperature: '°C',
	precipitation: 'mm',
	windSpeed: 'km/h',
	distance: 'ft',
	geopotential: 'gpdam'
};

describe('convertGeopotential', () => {
	it('convertit gpm → gpdam en divisant par 10', () => {
		expect(convertGeopotential(5520, 'gpdam')).toBe(552);
	});

	it('laisse les gpm inchangés', () => {
		expect(convertGeopotential(5520, 'gpm')).toBe(5520);
	});
});

describe('getUnitCategory', () => {
	it('classe le géopotentiel via le nom de variable, malgré l’unité de base « m »', () => {
		expect(getUnitCategory('m', 'geopotential_height_500hPa')).toBe('geopotential');
	});

	it('classe une vraie distance « m » sans variable géopotentielle', () => {
		expect(getUnitCategory('m')).toBe('distance');
		expect(getUnitCategory('m', 'visibility')).toBe('distance');
	});
});

describe('convertValue', () => {
	it('applique la conversion géopotentielle (prioritaire sur la distance)', () => {
		// unité de base « m » + variable géopotentielle → gpdam (÷10), pas des pieds.
		expect(convertValue(5520, 'm', prefs, 'geopotential_height_500hPa')).toBe(552);
	});

	it('convertit une vraie distance en pieds quand la variable n’est pas géopotentielle', () => {
		expect(convertValue(100, 'm', prefs, 'visibility')).toBeCloseTo(328.084, 2);
	});

	it('convertit une donnée en kelvins vers des °C (theta_e_850hPa)', () => {
		// 300 K → 26,85 °C : les 273,15 doivent bien être retirés.
		expect(convertValue(300, 'K', prefs, 'theta_e_850hPa')).toBeCloseTo(26.85, 2);
	});

	it('convertit une donnée en kelvins vers des °F', () => {
		// 300 K → 26,85 °C → 80,33 °F.
		const fahrenheit: UnitPreferences = { ...prefs, temperature: '°F' };
		expect(convertValue(300, 'K', fahrenheit, 'theta_e_850hPa')).toBeCloseTo(80.33, 2);
	});

	it('laisse une donnée déjà en °C inchangée (pas de double soustraction)', () => {
		expect(convertValue(15, '°C', prefs, 'temperature_2m')).toBe(15);
	});
});

describe('getDisplayUnit / getUnitOptions', () => {
	it('taux horaire (mm/h) : catégorie précipitations, « /h » conservé', () => {
		expect(getUnitCategory('mm/h')).toBe('precipitation');
		expect(getDisplayUnit('mm/h', prefs, 'precipitation')).toBe('mm/h');
		expect(getDisplayUnit('mm/h', { ...prefs, precipitation: 'inch' }, 'precipitation')).toBe(
			'inch/h'
		);
		expect(getDisplayUnit('mm', { ...prefs, precipitation: 'inch' }, 'precipitation_sum')).toBe(
			'inch'
		);
		expect(convertValue(25.4, 'mm/h', { ...prefs, precipitation: 'inch' })).toBeCloseTo(1);
	});

	it('affiche gpdam et expose les options gpm/gpdam pour le géopotentiel', () => {
		expect(getDisplayUnit('m', prefs, 'geopotential_height_500hPa')).toBe('gpdam');
		expect(getUnitOptions('m', 'geopotential_height_500hPa')?.map((o) => o.value)).toEqual([
			'gpm',
			'gpdam'
		]);
	});
});
