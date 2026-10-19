import { get } from 'svelte/store';

import { afterEach, describe, expect, it } from 'vitest';

import { time } from '$lib/stores/time';
import {
	normalizeWeatherAiLayers,
	weatherAiFrame,
	weatherAiRun,
	weatherAiTime
} from '$lib/stores/weather-ai';

import { cardSummary } from '$lib/weather-ai/displayed';
import { resolveFrame } from '$lib/weather-ai/frame';

import type { LoadedRun } from '$lib/weather-ai/loader';

// Run 06Z : échéances +6 h (12Z) à +72 h (21/10 06Z), toutes les 6 h.
const INIT = '2026-10-18T06:00:00Z';
const TIMES = Array.from({ length: 12 }, (_, k) =>
	new Date(Date.parse(INIT) + (k + 1) * 6 * 3_600_000).toISOString().replace('.000Z', 'Z')
);
const at = (iso: string) => new Date(iso);

describe('resolveFrame : échéance Weather AI à l’heure de la frise', () => {
	it('heure exacte d’une échéance', () => {
		expect(resolveFrame(TIMES, at('2026-10-18T18:00:00Z'))).toEqual({
			validTime: '2026-10-18T18:00:00Z',
			relation: 'exact',
			horizon: { first: TIMES[0], last: TIMES[11] }
		});
	});

	it('entre deux échéances : la plus proche inférieure ou égale', () => {
		const f = resolveFrame(TIMES, at('2026-10-18T21:00:00Z'));
		expect(f.relation).toBe('between');
		expect(f.validTime).toBe('2026-10-18T18:00:00Z');
	});

	it('hors horizon, avant +6 h ou après +72 h : rien d’affiché', () => {
		const before = resolveFrame(TIMES, at('2026-10-18T09:00:00Z'));
		expect(before.relation).toBe('before');
		expect(before.validTime).toBeUndefined();
		const after = resolveFrame(TIMES, at('2026-10-21T09:00:00Z'));
		expect(after.relation).toBe('after');
		expect(after.validTime).toBeUndefined();
		// La dernière échéance elle-même reste affichée.
		expect(resolveFrame(TIMES, at(TIMES[11])).relation).toBe('exact');
	});

	it('sans run ni heure : aucune échéance', () => {
		expect(resolveFrame([], at(TIMES[0]))).toEqual({ relation: 'none' });
		expect(resolveFrame(TIMES, undefined)).toEqual({ relation: 'none' });
	});
});

describe('weatherAiTime suit la frise principale', () => {
	const run: LoadedRun = {
		runId: 'wn2-oper-20261018T060000Z-035460bb3181',
		snapshotId: 's',
		publishedAt: '2026-10-18T13:58:28Z',
		initTime: INIT,
		available: [],
		ignored: [],
		loaded: {
			'global-cyclone-tracks-1deg': {
				kind: 'tracks',
				product: {
					productId: 'global-cyclone-tracks-1deg',
					spec: { kind: 'tracks', label: '', schemaPrefix: '' },
					attribution: '',
					licenseNotice: ''
				},
				frames: TIMES.map((vt) => ({ validTime: vt, product: {} as never }))
			}
		}
	};
	const saved = get(time);
	afterEach(() => {
		time.set(saved);
		weatherAiRun.set(undefined);
	});

	it('change d’échéance quand la frise bouge, sans curseur propre', () => {
		weatherAiRun.set(run);
		time.set(at('2026-10-19T00:00:00Z'));
		expect(get(weatherAiTime)).toBe('2026-10-19T00:00:00Z');
		time.set(at('2026-10-19T02:00:00Z'));
		expect(get(weatherAiTime)).toBe('2026-10-19T00:00:00Z');
		expect(get(weatherAiFrame).relation).toBe('between');
		time.set(at('2026-10-22T00:00:00Z'));
		expect(get(weatherAiTime)).toBeUndefined();
	});

	it('la légende annonce l’horizon du run Weather AI hors horizon', () => {
		const frame = resolveFrame(TIMES, at('2026-10-22T00:00:00Z'));
		const s = cardSummary(
			null,
			{ runId: run.runId, validTime: undefined },
			{ state: 'ready' },
			0,
			frame,
			INIT
		);
		expect(s.relation).toBe('after');
		expect(s.horizon).toBe('+6 h à +72 h, 18/10 12:00 → 21/10 06:00 UTC');
		expect(s.pending).toBe(false);
	});
});

describe('normalizeWeatherAiLayers', () => {
	it('écarte les anciennes superpositions de champs continus', () => {
		expect(normalizeWeatherAiLayers({ mslp: true, existence: true, tracks: true })).toEqual({
			tracks: true,
			cones: false
		});
		expect(normalizeWeatherAiLayers(null)).toEqual({ tracks: false, cones: false });
		expect(normalizeWeatherAiLayers({ cones: 'oui' })).toEqual({ tracks: false, cones: false });
	});
});
