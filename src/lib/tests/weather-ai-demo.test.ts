import { describe, expect, it } from 'vitest';

import { type ConesProduct, validateCones } from '$lib/weather-ai/cones';
import { loadDemoRun } from '$lib/weather-ai/demo';
import fixture from '$lib/weather-ai/fixtures/cones-public.fixture.json';
import { runValidTimes } from '$lib/weather-ai/loader';
import { buildTracks } from '$lib/weather-ai/tracks';

describe('loadDemoRun', () => {
	it('charge le run de référence archivé, marqué démo, init_time du produit', async () => {
		const run = await loadDemoRun();
		expect(run.demo).toBe(true);
		expect(run.initTime).toBe('2026-10-18T00:00:00Z');
		expect(runValidTimes(run)).toHaveLength(12);
	});

	it('les cônes de démonstration appartiennent au même run et suivent ses cyclones déclarés', async () => {
		const run = await loadDemoRun();
		const cones = fixture as unknown as ConesProduct;
		expect(validateCones(cones, { runId: run.runId, snapshotId: run.snapshotId })).toBeNull();
		const p = run.loaded['global-cyclone-tracks-1deg'];
		const tracks =
			p.kind === 'tracks'
				? buildTracks(
						p.frames.map((f) => f.product),
						run.runId
					)
				: [];
		const declared = tracks.filter((t) => t.kind === 'declared' && t.member === 0).map((t) => t.id);
		expect(cones.storms.map((s) => s.storm_id).sort()).toEqual(declared.sort());
		// Le run archivé contient des candidats de cyclogenèse (zones à surveiller).
		expect(tracks.some((t) => t.kind === 'candidate')).toBe(true);
	});
});
