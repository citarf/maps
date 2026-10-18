import { describe, expect, it, vi } from 'vitest';

import { WeatherAiHttpError, dataUrl, getJson } from '$lib/weather-ai/api';
import {
	type FetchJson,
	RunChangedError,
	leadHours,
	pickValidTime,
	prepareRun,
	pruneCache,
	runValidTimes
} from '$lib/weather-ai/loader';
import { discoverProducts } from '$lib/weather-ai/products';

import {
	EXISTENCE_ID,
	INIT_TIME,
	MSLP_ID,
	RUN_ID,
	SNAPSHOT_ID,
	TRACKS_ID,
	VALID_TIMES,
	catalog,
	data,
	gridDoc,
	runs,
	timeline,
	trackPoint,
	tracksDoc
} from './weather-ai-fixtures';

const BASE = 'https://api.test/weather-ai';

/** Faux serveur : route → document ; une route absente répond 404. */
function server(overrides: Record<string, unknown> = {}) {
	const routes: Record<string, unknown> = {
		[`${BASE}/runs`]: runs(),
		...Object.fromEntries(
			[MSLP_ID, EXISTENCE_ID, TRACKS_ID].map((id) => [
				`${BASE}/products/${id}/timeline`,
				timeline(id)
			])
		),
		...Object.fromEntries(
			VALID_TIMES.flatMap((vt) => [
				[dataUrl(BASE, MSLP_ID, vt), data(gridDoc(MSLP_ID, vt, (lat) => 101_300 + lat * 10))],
				[dataUrl(BASE, EXISTENCE_ID, vt), data(gridDoc(EXISTENCE_ID, vt, () => 0.2))],
				[dataUrl(BASE, TRACKS_ID, vt), data(tracksDoc(vt, [trackPoint({ valid_time: vt })]))]
			])
		),
		...overrides
	};
	const calls: string[] = [];
	const fetchJson: FetchJson = async <T>(url: string) => {
		calls.push(url);
		if (!(url in routes)) throw new WeatherAiHttpError(404, url, 'Not Found');
		const v = routes[url];
		if (v instanceof Error) throw v;
		return structuredClone(v) as T;
	};
	return { fetchJson, calls };
}

describe('getJson', () => {
	it('traite toute réponse non ok comme une erreur, avec le détail problem+json', async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(JSON.stringify({ title: 'Not Found', detail: 'unknown product' }), {
					status: 404,
					headers: { 'content-type': 'application/problem+json' }
				})
		);
		await expect(getJson('https://x/products/nope/timeline', undefined, fetchImpl)).rejects.toThrow(
			/HTTP 404 .* unknown product/
		);
	});

	it('renvoie le JSON d’une réponse ok', async () => {
		const fetchImpl = vi.fn(async () => new Response('{"run_id":"r"}', { status: 200 }));
		await expect(getJson('https://x/products', undefined, fetchImpl)).resolves.toEqual({
			run_id: 'r'
		});
	});

	it('encode valid_time dans l’URL de données', () => {
		expect(dataUrl(BASE, MSLP_ID, '2026-10-18T12:00:00Z')).toBe(
			`${BASE}/products/global-mslp-1deg/data?valid_time=2026-10-18T12%3A00%3A00Z`
		);
	});
});

describe('discoverProducts', () => {
	it('déduplique les product_id et ignore proprement les inconnus', () => {
		const { known, ignored } = discoverProducts(catalog([MSLP_ID, TRACKS_ID, 'global-t2m-1deg']));
		expect(known.map((p) => p.productId)).toEqual([MSLP_ID, TRACKS_ID]);
		expect(ignored).toEqual(['global-t2m-1deg']);
	});
});

describe('prepareRun', () => {
	it('charge les produits demandés et les trajectoires, init_time lu dans /runs', async () => {
		pruneCache([]);
		const { fetchJson, calls } = server();
		const run = await prepareRun(
			BASE,
			catalog([MSLP_ID, EXISTENCE_ID, TRACKS_ID]),
			['mslp'],
			undefined,
			fetchJson
		);
		expect(run.runId).toBe(RUN_ID);
		expect(run.snapshotId).toBe(SNAPSHOT_ID);
		expect(run.initTime).toBe(INIT_TIME);
		expect(Object.keys(run.loaded).sort()).toEqual([TRACKS_ID, MSLP_ID]);
		expect(calls.some((u) => u.includes(EXISTENCE_ID))).toBe(false);
		expect(runValidTimes(run)).toEqual(VALID_TIMES);
	});

	it('convertit la pression de Pa en hPa', async () => {
		pruneCache([]);
		const { fetchJson } = server();
		const run = await prepareRun(
			BASE,
			catalog([MSLP_ID, TRACKS_ID]),
			['mslp'],
			undefined,
			fetchJson
		);
		const mslp = run.loaded[MSLP_ID];
		expect(mslp.kind).toBe('mslp');
		const g = mslp.kind === 'mslp' ? mslp.frames[0].grid : undefined;
		expect(g!.unit).toBe('Pa');
		expect(g!.values[90 * 360]).toBeCloseTo(1013); // équateur : 101 300 Pa
	});

	it('n’appelle jamais un produit inconnu du catalogue', async () => {
		pruneCache([]);
		const { fetchJson, calls } = server();
		const run = await prepareRun(
			BASE,
			catalog([TRACKS_ID, 'global-wind10m-speed-1deg']),
			[],
			undefined,
			fetchJson
		);
		expect(run.ignored).toEqual(['global-wind10m-speed-1deg']);
		expect(calls.some((u) => u.includes('wind10m'))).toBe(false);
	});

	it('se rabat sur init_time des trajectoires quand /runs échoue — jamais sur le run_id', async () => {
		pruneCache([]);
		const { fetchJson } = server({ [`${BASE}/runs`]: new WeatherAiHttpError(503, 'runs', '') });
		const run = await prepareRun(BASE, catalog([TRACKS_ID]), [], undefined, fetchJson);
		expect(run.initTime).toBe(INIT_TIME);
	});

	it('lève RunChangedError si une frame appartient à un autre run', async () => {
		pruneCache([]);
		const vt = VALID_TIMES[2];
		const { fetchJson } = server({
			[dataUrl(BASE, TRACKS_ID, vt)]: data(tracksDoc(vt, [], { run_id: 'wn2-oper-nouveau' }))
		});
		await expect(
			prepareRun(BASE, catalog([TRACKS_ID]), [], undefined, fetchJson)
		).rejects.toBeInstanceOf(RunChangedError);
	});

	it('lève RunChangedError si la timeline a déjà basculé sur un autre run', async () => {
		pruneCache([]);
		const { fetchJson } = server({
			[`${BASE}/products/${TRACKS_ID}/timeline`]: timeline(TRACKS_ID, 'wn2-oper-nouveau')
		});
		await expect(
			prepareRun(BASE, catalog([TRACKS_ID]), [], undefined, fetchJson)
		).rejects.toBeInstanceOf(RunChangedError);
	});

	it('refuse le run sur une erreur HTTP, une unité inattendue ou une probabilité hors [0, 1]', async () => {
		const vt = VALID_TIMES[1];
		const cases: Record<string, unknown>[] = [
			{ [dataUrl(BASE, MSLP_ID, vt)]: new WeatherAiHttpError(404, 'x', 'Not Found') },
			{
				[dataUrl(BASE, MSLP_ID, vt)]: data(
					gridDoc(MSLP_ID, vt, () => 1013, {
						variable: {
							name: 'mean_sea_level_pressure',
							unit: 'hPa',
							values: new Array(65160).fill(1013)
						}
					})
				)
			},
			{ [dataUrl(BASE, EXISTENCE_ID, vt)]: data(gridDoc(EXISTENCE_ID, vt, () => 1.5)) }
		];
		for (const c of cases) {
			pruneCache([]);
			const { fetchJson } = server(c);
			await expect(
				prepareRun(
					BASE,
					catalog([MSLP_ID, EXISTENCE_ID, TRACKS_ID]),
					['mslp', 'existence'],
					undefined,
					fetchJson
				)
			).rejects.toThrow();
		}
	});

	it('refuse un catalogue non expérimental ou mélangeant deux runs', async () => {
		const { fetchJson } = server();
		await expect(
			prepareRun(BASE, catalog([TRACKS_ID], { experimental: false }), [], undefined, fetchJson)
		).rejects.toThrow(/expérimental/);
		const mixed = catalog([TRACKS_ID]);
		mixed.produits[1].run_id = 'wn2-oper-autre';
		await expect(prepareRun(BASE, mixed, [], undefined, fetchJson)).rejects.toThrow(/mélangés/);
	});

	it('réutilise le cache <run_id>:<product_id>:<valid_time>', async () => {
		pruneCache([]);
		const first = server();
		await prepareRun(BASE, catalog([TRACKS_ID]), [], undefined, first.fetchJson);
		const second = server();
		await prepareRun(BASE, catalog([TRACKS_ID]), [], undefined, second.fetchJson);
		expect(second.calls.filter((u) => u.includes('/data?'))).toEqual([]);
	});
});

describe('échéances', () => {
	it('leadHours depuis init_time, rien sans init_time', () => {
		expect(leadHours(INIT_TIME, '2026-10-18T18:00:00Z')).toBe(18);
		expect(leadHours(undefined, '2026-10-18T18:00:00Z')).toBeUndefined();
	});

	it('pickValidTime garde l’échéance, sinon la première non écoulée', () => {
		const now = Date.parse('2026-10-18T10:00:00Z');
		expect(pickValidTime(VALID_TIMES, VALID_TIMES[2], now)).toBe(VALID_TIMES[2]);
		expect(pickValidTime(VALID_TIMES, '2026-10-17T00:00:00Z', now)).toBe(VALID_TIMES[1]);
		expect(pickValidTime(VALID_TIMES, undefined, Date.parse('2026-10-25T00:00:00Z'))).toBe(
			VALID_TIMES[0]
		);
	});
});
