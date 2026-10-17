import { variableHasDirections } from '@openmeteo/weather-map-layer';
import { describe, expect, it } from 'vitest';

import { parseSources, serializeSources } from '$lib/chart-encoding';
import { PRESET_GROUP_ORDER, chartPresets, getChartPreset } from '$lib/chart-presets';

describe('chartPresets', () => {
	it('has unique ids', () => {
		const ids = chartPresets.map((preset) => preset.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('has unique variables per chart and at least one layer per source', () => {
		for (const preset of chartPresets) {
			const variables = preset.sources.map((source) => source.variable);
			expect(new Set(variables).size, preset.id).toBe(variables.length);
			expect(preset.sources.length, preset.id).toBeGreaterThan(0);
			for (const source of preset.sources) {
				expect(
					!!(source.raster || source.contours || source.arrows),
					`${preset.id}: ${source.variable}`
				).toBe(true);
			}
		}
	});

	it('only sets contour intervals on contour sources, with sane values', () => {
		for (const preset of chartPresets) {
			for (const source of preset.sources) {
				if (source.contourInterval !== undefined) {
					expect(source.contours, `${preset.id}: ${source.variable}`).toBe(true);
					expect(source.contourInterval, `${preset.id}: ${source.variable}`).toBeGreaterThan(0);
				}
			}
		}
	});

	it('only enables arrows on direction-capable variables', () => {
		for (const preset of chartPresets) {
			for (const source of preset.sources) {
				if (source.arrows) {
					expect(variableHasDirections(source.variable), `${preset.id}: ${source.variable}`).toBe(
						true
					);
				}
			}
		}
	});

	it('libellés, descriptions et groupes en français', () => {
		for (const preset of chartPresets) {
			expect(preset.label, preset.id).not.toMatch(/\b(Temperature|Wind|Pressure|Cloud|Precip)\b/);
			expect(PRESET_GROUP_ORDER, preset.id).toContain(preset.group);
		}
	});

	it('chaque composition round-trip via serializeSources/parseSources', () => {
		for (const preset of chartPresets) {
			expect(parseSources(serializeSources(preset.sources)), preset.id).toEqual(preset.sources);
		}
	});

	it('contient les compositions Infoclimat', () => {
		expect(getChartPreset('thetaw850_z500')?.sources.map((s) => s.variable)).toEqual([
			'theta_w_850hPa',
			'geopotential_height_500hPa'
		]);
		expect(getChartPreset('thickness_mslp')?.sources.map((s) => s.variable)).toEqual([
			'thickness_500_1000hPa',
			'pressure_msl'
		]);
	});
});
