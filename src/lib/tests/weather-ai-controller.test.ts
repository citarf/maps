import { get } from 'svelte/store';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { weatherAiLayers, weatherAiRun, weatherAiStatus } from '$lib/stores/weather-ai';

import { getWeatherAiApiUrl } from '$lib/runtime-env';
import { dataUrl } from '$lib/weather-ai/api';
import { useWeatherAi } from '$lib/weather-ai/controller';
import { pruneCache } from '$lib/weather-ai/loader';

import {
	MSLP_ID,
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
function stubPortal(gate: Promise<void>) {
	const routes: Record<string, unknown> = {
		[`${BASE}/products`]: catalog([MSLP_ID, TRACKS_ID]),
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
	weatherAiRun.set(undefined);
	weatherAiLayers.set({ mslp: false, existence: false, tracks: false, cones: false });
	pruneCache([]);
});

describe('controller', () => {
	it('charge une couche activée pendant la préparation du run, sans attendre le prochain poll', async () => {
		let open!: () => void;
		const gate = new Promise<void>((r) => (open = r));
		const calls = stubPortal(gate);
		weatherAiLayers.set({ mslp: false, existence: false, tracks: true, cones: false });
		const release = useWeatherAi();
		try {
			await until(() => calls.includes(`${BASE}/runs`)); // prepareRun en vol
			weatherAiLayers.update((l) => ({ ...l, mslp: true })); // activée pendant la préparation
			open();
			await until(() => !!get(weatherAiRun)?.loaded[MSLP_ID]);
			expect(get(weatherAiStatus).state).toBe('ready');
			expect(calls.filter((u) => u.includes(`${MSLP_ID}/data`))).toHaveLength(VALID_TIMES.length);
		} finally {
			release();
		}
	});

	it('garde un échec réseau propre : statut d’erreur explicite, aucun run inventé', async () => {
		vi.stubGlobal('fetch', async () => {
			throw new TypeError('Failed to fetch'); // ce que lève un navigateur bloqué par CORS
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		weatherAiLayers.set({ mslp: false, existence: false, tracks: true, cones: false });
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
