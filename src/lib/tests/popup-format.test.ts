import { describe, expect, it } from 'vitest';

import {
	ARROW_OPACITY_RANGE,
	ARROW_WIDTH_RANGE,
	alphaOf,
	arrowStyleAnchors,
	isPressureOrHeight,
	rampAt,
	rescaledRamp,
	shortLabel,
	truncateLabel,
	unwrapAngle
} from '$lib/popup-format';
import { defaultArrowStyle } from '$lib/vector-styles';

describe('shortLabel', () => {
	it('abrège les variables connues et garde le niveau de pression', () => {
		expect(shortLabel('pressure_msl')).toBe('Pmer');
		expect(shortLabel('geopotential_height_500hPa')).toBe('Z 500');
		expect(shortLabel('temperature_850hPa')).toBe('T 850');
		expect(shortLabel('wind_u_component_850hPa')).toBe('Vent 850');
		expect(shortLabel('cloud_cover_low')).toBe('Nuages bas');
		expect(shortLabel('theta_w_850hPa')).toBe("θ'w 850");
		expect(shortLabel('thickness_500_1000hPa')).toBe('Épaisseur');
	});

	it('niveaux en mètres : pas de numéro', () => {
		expect(shortLabel('temperature_2m')).toBe('T');
		expect(shortLabel('wind_u_component_10m')).toBe('Vent');
	});

	it('variable inconnue : libellé tronqué', () => {
		expect(shortLabel('some_unknown_variable_name').length).toBeLessThanOrEqual(15);
	});
});

it('truncateLabel garde le niveau', () => {
	expect(truncateLabel('Hauteur géopotentielle (500 hPa)', 20)).toBe('Hauteur g… (500 hPa)');
	expect(truncateLabel('Court', 20)).toBe('Court');
});

it('isPressureOrHeight', () => {
	expect(isPressureOrHeight('pressure_msl')).toBe(true);
	expect(isPressureOrHeight('geopotential_height_500hPa')).toBe(true);
	expect(isPressureOrHeight('temperature_850hPa')).toBe(false);
});

describe('rampes de la flèche', () => {
	it('alphaOf', () => {
		expect(alphaOf('rgba(0,0,0, 0.3)')).toBe(0.3);
		expect(alphaOf('rgb(1,2,3)')).toBe(1);
	});

	it('rampAt interpole et borne', () => {
		const anchors = [
			[0, 0],
			[10, 1]
		];
		expect(rampAt(anchors, -5, 1)).toBe(0);
		expect(rampAt(anchors, 5, 1)).toBe(0.5);
		expect(rampAt(anchors, 50, 1)).toBe(1);
	});

	it('rescaledRamp reste dans la plage et croît avec la vitesse', () => {
		const style = arrowStyleAnchors(defaultArrowStyle, false);
		const weak = rescaledRamp(style, 0, 1, ARROW_OPACITY_RANGE);
		const strong = rescaledRamp(style, 30, 1, ARROW_OPACITY_RANGE);
		expect(weak).toBeCloseTo(ARROW_OPACITY_RANGE[0]);
		expect(strong).toBeCloseTo(ARROW_OPACITY_RANGE[1]);
		const width = rescaledRamp(style, 5, 2, ARROW_WIDTH_RANGE);
		expect(width).toBeGreaterThanOrEqual(ARROW_WIDTH_RANGE[0]);
		expect(width).toBeLessThanOrEqual(ARROW_WIDTH_RANGE[1]);
	});
});

it('unwrapAngle prend le plus court chemin à travers 0/360', () => {
	expect(unwrapAngle(350, 10)).toBe(370);
	expect(unwrapAngle(10, 350)).toBe(-10);
	expect(unwrapAngle(720, 90)).toBe(810);
});
