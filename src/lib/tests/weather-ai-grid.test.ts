import { describe, expect, it } from 'vitest';

import {
	MERCATOR_MAX_LAT,
	isolineLevels,
	isolines,
	mercatorRowLatitude,
	normalizeGrid,
	renderMercatorRgba,
	sampleGrid,
	wrapLongitude
} from '$lib/weather-ai/grid';
import {
	PROBABILITY_FLOOR,
	formatLead,
	formatUtc,
	isobarsGeoJson,
	probabilityColor
} from '$lib/weather-ai/render';

import { EXISTENCE_ID, MSLP_ID, VALID_TIMES, gridDoc } from './weather-ai-fixtures';

describe('normalizeGrid', () => {
	it('remet les longitudes 0..359 en −180..179 et garde les lignes sud → nord', () => {
		// Valeur = longitude native (0..359) : la colonne 0 normalisée vient de la colonne native 180.
		const g = normalizeGrid(gridDoc(MSLP_ID, VALID_TIMES[0], (_lat, lon) => lon));
		expect(g.lons[0]).toBe(-180);
		expect(g.lons[359]).toBe(179);
		expect(g.lats[0]).toBe(-90);
		expect(g.lats[180]).toBe(90);
		expect(g.values[0]).toBe(180); // lon −180 = 180 natif
		expect(g.values[180]).toBe(0); // lon 0
		expect(g.values[359]).toBe(179);
		expect(g.periodic).toBe(true);
	});

	it('lit la géométrie dans grid, y compris un pas de latitude négatif (nord → sud)', () => {
		const doc = gridDoc(MSLP_ID, VALID_TIMES[0], (lat) => lat);
		// Même champ réécrit du nord au sud.
		const values: number[] = [];
		for (let i = 0; i < 181; i++) for (let j = 0; j < 360; j++) values.push(90 - i);
		const g = normalizeGrid({
			...doc,
			grid: { ...doc.grid, latitude_start: 90, latitude_step: -1 },
			variable: { ...doc.variable, values }
		});
		expect(g.lats[0]).toBe(-90);
		expect(g.values[0]).toBe(-90);
		expect(g.values[180 * 360]).toBe(90);
	});

	it('refuse une grille incompatible (ordre, nombre de valeurs)', () => {
		const doc = gridDoc(MSLP_ID, VALID_TIMES[0], () => 1);
		expect(() =>
			normalizeGrid({ ...doc, grid: { ...doc.grid, order: 'longitude-major' } })
		).toThrow(/ordre/);
		expect(() =>
			normalizeGrid({ ...doc, variable: { ...doc.variable, values: doc.variable.values.slice(1) } })
		).toThrow(/nombre de valeurs/);
	});
});

describe('sampleGrid', () => {
	const g = normalizeGrid(gridDoc(MSLP_ID, VALID_TIMES[0], (lat, lon) => lat * 1000 + lon));

	it('interpole et boucle à l’antiméridien', () => {
		expect(sampleGrid(g, 10, 20)).toBeCloseTo(10_020);
		// Entre 179 (natif 179) et −180 (natif 180) : moitié du chemin.
		expect(sampleGrid(g, 0, 179.5)).toBeCloseTo(179.5);
		expect(sampleGrid(g, 0, -179.5)).toBeCloseTo(180.5);
	});

	it('wrapLongitude ramène dans [−180, 180[', () => {
		expect(wrapLongitude(359)).toBe(-1);
		expect(wrapLongitude(180)).toBe(-180);
		expect(wrapLongitude(-190)).toBe(170);
	});
});

describe('renderMercatorRgba', () => {
	it('place le nord en haut de l’image', () => {
		const g = normalizeGrid(gridDoc(EXISTENCE_ID, VALID_TIMES[0], (lat) => (lat > 0 ? 1 : 0)));
		const rgba = renderMercatorRgba(g, 4, 4, (v) => (v > 0.5 ? [255, 0, 0, 255] : null));
		expect(rgba[3]).toBe(255); // pixel (0, 0) : nord
		expect(rgba[(3 * 4 + 0) * 4 + 3]).toBe(0); // dernière ligne : sud, transparent
	});

	it('rééchantillonne par latitude Mercator', () => {
		expect(mercatorRowLatitude(0, 1000)).toBeCloseTo(MERCATOR_MAX_LAT, 0);
		expect(mercatorRowLatitude(999, 1000)).toBeCloseTo(-MERCATOR_MAX_LAT, 0);
		expect(mercatorRowLatitude(499.5, 1000)).toBeCloseTo(0, 5);
	});
});

describe('isolines', () => {
	it('ferme une isoligne autour d’un minimum', () => {
		const g = normalizeGrid(
			gridDoc(MSLP_ID, VALID_TIMES[0], (lat, lon) => Math.hypot(lat - 10, lon - 60))
		);
		const lines = isolines(g, 5);
		expect(lines).toHaveLength(1);
		const ring = lines[0];
		expect(ring[0]).toEqual(ring[ring.length - 1]);
		for (const [lon, lat] of ring) expect(Math.hypot(lat - 10, lon - 60)).toBeCloseTo(5, 0);
	});

	it('ne coupe pas une isoligne qui franchit l’antiméridien', () => {
		// Minimum centré sur 180° : l'anneau traverse la couture des colonnes.
		const dist = (lat: number, lon: number) =>
			Math.hypot(lat, Math.min(Math.abs(lon - 180), 360 - Math.abs(lon - 180)));
		const g = normalizeGrid(gridDoc(MSLP_ID, VALID_TIMES[0], dist));
		const lines = isolines(g, 5);
		const points = lines.flat();
		// Toute la ligne reste près de 180°, d'un côté ou de l'autre (aucun tracé à travers la carte).
		for (const [lon, lat] of points) expect(dist(lat, wrapLongitude(lon) + 360)).toBeCloseTo(5, 0);
		// Les deux moitiés se rejoignent exactement sur le méridien ±180.
		const ends = lines.flatMap((l) => [l[0], l[l.length - 1]]);
		for (const [lon] of ends) expect(Math.abs(lon)).toBeCloseTo(180, 5);
	});

	it('isolineLevels couvre la plage par multiples du pas', () => {
		const g = normalizeGrid(gridDoc(MSLP_ID, VALID_TIMES[0], (lat) => 1000 + lat / 10));
		expect(isolineLevels(g, 4)).toEqual([992, 996, 1000, 1004, 1008]);
	});
});

describe('rendu', () => {
	it('isobares en hPa, trait renforcé tous les 20 hPa', () => {
		const g = normalizeGrid(gridDoc(MSLP_ID, VALID_TIMES[0], (lat) => 1000 + lat / 10));
		const fc = isobarsGeoJson(g);
		const levels = [...new Set(fc.features.map((f) => f.properties!.hpa))];
		expect(levels).toEqual([992, 996, 1000, 1004, 1008]);
		expect(fc.features.find((f) => f.properties!.hpa === 1000)!.properties!.major).toBe(true);
		expect(fc.features.find((f) => f.properties!.hpa === 996)!.properties!.major).toBe(false);
	});

	it('probabilité transparente sous le seuil, opacité croissante au-delà', () => {
		expect(probabilityColor(0)).toBeNull();
		expect(probabilityColor(PROBABILITY_FLOOR - 0.001)).toBeNull();
		expect(probabilityColor(Number.NaN)).toBeNull();
		const a = probabilityColor(0.1)!;
		const b = probabilityColor(0.9)!;
		expect(b[3]).toBeGreaterThan(a[3]);
		expect(probabilityColor(1)).toEqual(probabilityColor(1.2));
	});

	it('libellés UTC et échéance relative', () => {
		expect(formatUtc('2026-10-19T18:00:00Z')).toBe('19/10 18:00 UTC');
		expect(formatLead(18)).toBe('+18 h');
		expect(formatLead(undefined)).toBe('');
	});
});
