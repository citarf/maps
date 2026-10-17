import { describe, expect, it } from 'vitest';

import { getChartPreset } from '$lib/chart-presets';
import {
	compositionsEqual,
	defaultOverlayFor,
	effectiveOverlayFlags,
	isSourceAvailable,
	matchPresetComposition,
	splitChartSources
} from '$lib/composition';

describe('splitChartSources', () => {
	it('extrait le fond et garde le reste en superpositions', () => {
		expect(splitChartSources(getChartPreset('z500_t850')!.sources)).toEqual({
			variable: 'temperature_850hPa',
			overlays: [{ variable: 'geopotential_height_500hPa', contours: true, contourInterval: 12.5 }]
		});
	});
	it('reporte les isolignes du fond en superposition sans aplat', () => {
		expect(splitChartSources(getChartPreset('mslp')!.sources)).toEqual({
			variable: 'pressure_msl',
			overlays: [{ variable: 'pressure_msl', contours: true, contourInterval: 2 }]
		});
	});
	it('sans aucun aplat : la première source devient le fond', () => {
		const c = splitChartSources([{ variable: 'pressure_msl', contours: true }]);
		expect(c.variable).toBe('pressure_msl');
		expect(c.overlays).toEqual([{ variable: 'pressure_msl', contours: true }]);
	});
});

it('compositionsEqual compare fond et superpositions', () => {
	const a = {
		variable: 'temperature_2m',
		overlays: [{ variable: 'pressure_msl', contours: true }]
	};
	expect(compositionsEqual(a, structuredClone(a))).toBe(true);
	expect(compositionsEqual(a, { ...a, variable: 'pressure_msl' })).toBe(false);
	expect(compositionsEqual(a, { ...a, overlays: [] })).toBe(false);
});

it('matchPresetComposition reconnaît une composition et rejette une variante', () => {
	const c = splitChartSources(getChartPreset('rain_mslp')!.sources);
	expect(matchPresetComposition(c)?.id).toBe('rain_mslp');
	expect(matchPresetComposition({ ...c, overlays: [] })).toBeUndefined();
});

it('defaultOverlayFor : flèches pour le vent, isolignes sinon', () => {
	expect(defaultOverlayFor('wind_u_component_850hPa', true)).toEqual({
		variable: 'wind_u_component_850hPa',
		arrows: true
	});
	expect(defaultOverlayFor('wind_u_component_850hPa', false)).toEqual({
		variable: 'wind_u_component_850hPa',
		contours: true
	});
	expect(defaultOverlayFor('pressure_msl', true)).toEqual({
		variable: 'pressure_msl',
		contours: true
	});
});

it('isSourceAvailable : variable stockée, dérivée, absente, meta non chargé', () => {
	const meta = ['temperature_2m', 'wind_u_component_10m', 'wind_v_component_10m'];
	expect(isSourceAvailable({ variable: 'temperature_2m' }, meta)).toBe(true);
	expect(isSourceAvailable({ variable: 'pressure_msl' }, meta)).toBe(false);
	expect(isSourceAvailable({ variable: 'temperature_2m' }, undefined)).toBe(false);
});

describe('effectiveOverlayFlags', () => {
	const ctx = {
		primary: 'pressure_msl',
		primaryContours: true,
		primaryArrows: true,
		windArrowLevel: '10m'
	};
	it('neutralise aplat et isolignes déjà dessinés par le fond', () => {
		expect(
			effectiveOverlayFlags({ variable: 'pressure_msl', raster: true, contours: true }, ctx)
		).toEqual({ raster: false, contours: false, arrows: false });
	});
	it('garde les isolignes du fond quand le fond ne les dessine pas', () => {
		expect(
			effectiveOverlayFlags(
				{ variable: 'pressure_msl', contours: true },
				{ ...ctx, primaryContours: false }
			)
		).toEqual({ raster: false, contours: true, arrows: false });
	});
	it('neutralise les flèches du niveau déjà rendu par l’overlay vent', () => {
		expect(
			effectiveOverlayFlags({ variable: 'wind_u_component_10m', arrows: true }, ctx).arrows
		).toBe(false);
		expect(
			effectiveOverlayFlags({ variable: 'wind_u_component_850hPa', arrows: true }, ctx).arrows
		).toBe(true);
	});
	it('ignore les flèches d’une variable sans direction', () => {
		expect(effectiveOverlayFlags({ variable: 'temperature_2m', arrows: true }, ctx).arrows).toBe(
			false
		);
	});
});
