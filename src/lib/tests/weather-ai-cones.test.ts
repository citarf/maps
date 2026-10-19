import { bbox } from '@turf/turf';
import { describe, expect, it } from 'vitest';

import {
	CONES_MENTION,
	type Cone,
	type ConesProduct,
	availableRuns,
	conesToGeoJson,
	envelope,
	validateCones
} from '$lib/weather-ai/cones';
import fixture from '$lib/weather-ai/fixtures/cones-public.fixture.json';

const doc = fixture as unknown as ConesProduct;
const expected = { runId: doc.run_id, snapshotId: doc.snapshot_id };

const cone = (lead: number, lat: number, lon: number, r = 100): Cone => ({
	lead_hours: lead,
	valid_time: `2026-10-18T${String(lead % 24).padStart(2, '0')}:00:00Z`,
	available: true,
	available_members: 3,
	centre: { latitude: lat, longitude: lon },
	radius_km: { '0.68': r, '0.90': r * 1.6 }
});

describe('validateCones', () => {
	it('accepte la fixture construite d’après le schéma, pour son run', () => {
		expect(validateCones(doc, expected)).toBeNull();
	});

	it('refuse une mention absente ou différente', () => {
		expect(validateCones({ ...doc, mention: '' }, expected)).toMatch(/mention/);
		expect(validateCones({ ...doc, mention: CONES_MENTION + ' ' }, expected)).toMatch(/mention/);
	});

	it('refuse un document d’un autre run que celui affiché', () => {
		expect(validateCones(doc, { ...expected, runId: 'wn2-oper-autre' })).toMatch(/run/);
	});

	it('refuse sans autorisation de diffusion publique ou avec autorité d’alerte', () => {
		expect(validateCones({ ...doc, public_delivery_allowed: false }, expected)).not.toBeNull();
		expect(validateCones({ ...doc, alert_authority: true }, expected)).not.toBeNull();
	});
});

describe('availableRuns', () => {
	it('coupe l’enveloppe à chaque indisponibilité, sans interpoler', () => {
		const w36 = doc.storms.find((s) => s.storm_id.endsWith('36W'))!;
		const runs = availableRuns(w36.cones);
		expect(runs.map((r) => r.map((c) => c.lead_hours))).toEqual([
			[6, 12, 18, 24, 30, 36, 42],
			[54, 60, 66, 72]
		]);
	});

	it('hémisphère sud : aucun cône au-delà de maximum_lead_hours', () => {
		const p01 = doc.storms.find((s) => s.hemisphere === 'south')!;
		expect(p01.maximum_lead_hours).toBe(24);
		const leads = availableRuns(p01.cones)
			.flat()
			.map((c) => c.lead_hours);
		expect(Math.max(...leads)).toBeLessThanOrEqual(24);
	});
});

describe('envelope', () => {
	it('relie les cercles successifs et contient chaque cercle', () => {
		const run = [cone(6, 15, 140), cone(12, 16, 138)];
		const env = envelope(run as Extract<Cone, { available: true }>[], '0.68')!;
		const [minX, minY, maxX, maxY] = bbox(env);
		// ~100 km ≈ 0,9° autour des centres
		expect(minX).toBeLessThan(138 - 0.8);
		expect(maxX).toBeGreaterThan(140 + 0.8);
		expect(minY).toBeLessThan(15 - 0.8);
		expect(maxY).toBeGreaterThan(16 + 0.8);
		expect(env.geometry.type).toBe('Polygon');
	});

	it('reste d’un seul tenant à travers l’antiméridien', () => {
		const run = [cone(6, 15, 179), cone(12, 15, -179)];
		const env = envelope(run as Extract<Cone, { available: true }>[], '0.90')!;
		const [minX, , maxX] = bbox(env);
		expect(maxX - minX).toBeLessThan(10); // et non ~360°
		expect(maxX).toBeGreaterThan(180);
	});

	it('produit les deux niveaux, 90 % avant 68 % (68 % dessiné par-dessus)', () => {
		const { envelopes, centres } = conesToGeoJson(doc);
		const levels = envelopes.features.map((f) => f.properties!.level);
		expect(levels.indexOf('0.90')).toBeLessThan(levels.indexOf('0.68'));
		expect(centres.features.every((f) => f.properties!.members >= doc.member_quorum)).toBe(true);
	});
});

describe('limite de l’hémisphère sud (southern_maximum_lead_hours)', () => {
	// Document synthétique : cyclone sud limité à +24 h, mais avec un cône
	// « disponible » à +48 h (contrat violé).
	const southDoc = (): ConesProduct => ({
		...doc,
		storms: [
			{
				storm_id: 'ecmwf-tf:2026:02S',
				hemisphere: 'south',
				maximum_lead_hours: 24,
				cones: [cone(6, -15, 60), cone(24, -16, 58), cone(48, -18, 55)]
			}
		]
	});

	it('refuse un cône disponible au-delà de la limite sud', () => {
		expect(validateCones(southDoc(), expected)).toMatch(/au-delà de \+24 h/);
	});

	it('refuse un cyclone sud annonçant une échéance maximale au-delà de la limite', () => {
		const d = southDoc();
		d.storms[0].maximum_lead_hours = 72;
		d.storms[0].cones = d.storms[0].cones.slice(0, 2);
		expect(validateCones(d, expected)).toMatch(/limite/);
	});

	it('n’affiche jamais un cône sud au-delà de la limite, même sans validation', () => {
		const { centres } = conesToGeoJson(southDoc());
		expect(centres.features.map((f) => f.properties!.lead)).toEqual([6, 24]);
	});

	it('accepte un cyclone sud limité à +24 h avec des indisponibilités au-delà', () => {
		const d = southDoc();
		d.storms[0].cones[2] = {
			lead_hours: 48,
			valid_time: '2026-10-20T00:00:00Z',
			available: false,
			available_members: 3,
			reason: 'southern_hemisphere_availability_below_threshold'
		};
		expect(validateCones(d, expected)).toBeNull();
	});
});
