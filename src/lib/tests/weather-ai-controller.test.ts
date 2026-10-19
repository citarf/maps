import { get } from 'svelte/store';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	weatherAiCones,
	weatherAiLayers,
	weatherAiRun,
	weatherAiStatus
} from '$lib/stores/weather-ai';

import { getWeatherAiApiUrl } from '$lib/runtime-env';
import { dataUrl } from '$lib/weather-ai/api';
import { CONES_PRODUCT_ID } from '$lib/weather-ai/cones';
import { useWeatherAi } from '$lib/weather-ai/controller';
import { pruneCache } from '$lib/weather-ai/loader';

import {
	EXISTENCE_ID,
	MSLP_ID,
	RUN_ID,
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

const BASE = getWeatherAiApiUrl();

/** Faux portail : `gate` retient la réponse de /runs pour figer prepareRun. */
function stubPortal(gate: Promise<void>, productIds = [MSLP_ID, EXISTENCE_ID, TRACKS_ID]) {
	const routes: Record<string, unknown> = {
		[`${BASE}/products`]: catalog(productIds),
		[`${BASE}/runs`]: runs(),
		[`${BASE}/products/${MSLP_ID}/timeline`]: timeline(MSLP_ID),
		[`${BASE}/products/${TRACKS_ID}/timeline`]: timeline(TRACKS_ID),
		...Object.fromEntries(
			VALID_TIMES.flatMap((vt) => [
				[dataUrl(BASE, MSLP_ID, vt), data(gridDoc(MSLP_ID, vt, () => 101_300))],
				[dataUrl(BASE, TRACKS_ID, vt), data(tracksDoc(vt, [trackPoint({ valid_time: vt })]))]
			])
		)
	};
	const calls: string[] = [];
	vi.stubGlobal('fetch', async (url: string) => {
		calls.push(url);
		if (url === `${BASE}/runs`) await gate;
		if (!(url in routes)) return new Response('{"title":"Not Found"}', { status: 404 });
		return new Response(JSON.stringify(routes[url]), { status: 200 });
	});
	return calls;
}

const until = async (cond: () => boolean, ms = 2000) => {
	const t0 = Date.now();
	while (!cond()) {
		if (Date.now() - t0 > ms) throw new Error('délai dépassé');
		await new Promise((r) => setTimeout(r, 5));
	}
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	weatherAiRun.set(undefined);
	weatherAiCones.set(null);
	weatherAiLayers.set({ tracks: false, cones: false });
	pruneCache([]);
});

describe('controller', () => {
	it('ne charge jamais les champs continus (pression, probabilité) : seules les superpositions', async () => {
		const calls = stubPortal(Promise.resolve());
		weatherAiLayers.set({ tracks: true, cones: false });
		const release = useWeatherAi();
		try {
			await until(() => !!get(weatherAiRun)?.loaded[TRACKS_ID]);
			const run = get(weatherAiRun)!;
			expect(Object.keys(run.loaded)).toEqual([TRACKS_ID]);
			expect(calls.some((u) => u.includes(MSLP_ID) || u.includes(EXISTENCE_ID))).toBe(false);
			// Les produits restent connus (futur modèle du sélecteur), sans être chargés.
			expect(run.available.map((p) => p.productId)).toContain(MSLP_ID);
		} finally {
			release();
		}
	});

	it('réconcilie une superposition activée pendant la préparation du run (cônes)', async () => {
		vi.stubEnv('VITE_WEATHER_AI_CONES', 'on');
		let open!: () => void;
		const gate = new Promise<void>((r) => (open = r));
		const calls = stubPortal(gate, [TRACKS_ID, CONES_PRODUCT_ID]);
		weatherAiLayers.set({ tracks: true, cones: false });
		const release = useWeatherAi();
		try {
			await until(() => calls.includes(`${BASE}/runs`)); // prepareRun en vol
			weatherAiLayers.update((l) => ({ ...l, cones: true })); // activée pendant la préparation
			open();
			// Sans la réconciliation, rien ne se passerait avant le prochain relevé (5 min).
			await until(() => get(weatherAiCones)?.runId === RUN_ID);
			// La route des cônes n'est pas définie par le portail : refus explicite, pas de cône.
			expect(get(weatherAiCones)?.doc).toBeNull();
			expect(get(weatherAiCones)?.message).toMatch(/Route HTTP des cônes/);
		} finally {
			release();
		}
	});

	it('garde un échec réseau propre : statut d’erreur explicite, aucun run inventé', async () => {
		vi.stubGlobal('fetch', async () => {
			throw new TypeError('Failed to fetch'); // ce que lève un navigateur bloqué (réseau, CORS)
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		weatherAiLayers.set({ tracks: true, cones: false });
		const release = useWeatherAi();
		try {
			await until(() => get(weatherAiStatus).state === 'error');
			expect(get(weatherAiStatus).message).toMatch(/injoignable/);
			expect(get(weatherAiRun)).toBeUndefined();
		} finally {
			release();
			warn.mockRestore();
		}
	});
});
