import { describe, expect, it, vi } from 'vitest';

import { OverlayStack, desiredOverlayLayers, planOverlayUpdates } from '$lib/overlay-stack';

import type { ChartSource } from '$lib/chart-types';
import type * as maplibregl from 'maplibre-gl';

const ctx = {
	primary: 'temperature_850hPa',
	primaryContours: false,
	primaryArrows: false,
	windArrowLevel: null,
	metaVariables: ['temperature_850hPa', 'geopotential_height_500hPa', 'cloud_cover_low']
};
const urlFor = (s: ChartSource) => `u/${s.variable}`;

describe('desiredOverlayLayers', () => {
	it('un plan vecteur pour des isolignes, un plan aplat pour un aplat', () => {
		expect(
			desiredOverlayLayers(
				[
					{ variable: 'geopotential_height_500hPa', contours: true },
					{ variable: 'cloud_cover_low', raster: true }
				],
				ctx,
				urlFor
			).map((p) => p.key)
		).toEqual(['0:geopotential_height_500hPa:vector', '1:cloud_cover_low:raster']);
	});

	it('saute une superposition indisponible sur le domaine', () => {
		expect(
			desiredOverlayLayers([{ variable: 'pressure_msl', contours: true }], ctx, urlFor)
		).toEqual([]);
	});

	it('saute une superposition entièrement neutralisée par le fond', () => {
		expect(
			desiredOverlayLayers([{ variable: 'temperature_850hPa', raster: true }], ctx, urlFor)
		).toEqual([]);
	});
});

describe('planOverlayUpdates', () => {
	it('planOverlayUpdates : ne recharge que ce qui change, retire le reste', () => {
		const desired = desiredOverlayLayers(
			[{ variable: 'geopotential_height_500hPa', contours: true }],
			ctx,
			urlFor
		);
		const current = new Map([
			['0:geopotential_height_500hPa:vector', 'u/geopotential_height_500hPa'],
			['1:cloud_cover_low:raster', 'u/x']
		]);
		expect(planOverlayUpdates(current, desired)).toEqual({
			update: [],
			remove: ['1:cloud_cover_low:raster']
		});
		expect(planOverlayUpdates(new Map(), desired).update).toHaveLength(1);
	});
});

describe('OverlayStack.sync', () => {
	// Carte minimale : `sync` ne touche pas la carte (aucun `update()`), seul
	// `destroy()` interroge sources et couches.
	const fakeMap = () =>
		({
			style: { getSource: () => undefined },
			getLayer: () => undefined
		}) as unknown as maplibregl.Map;

	const makeStack = () =>
		new OverlayStack(fakeMap(), {
			onReady: () => {},
			onError: () => {},
			rasterBefore: () => 'raster-before',
			vectorBefore: () => 'vector-before',
			layers: () => []
		});

	const plans = desiredOverlayLayers(
		[
			{ variable: 'geopotential_height_500hPa', contours: true },
			{ variable: 'cloud_cover_low', raster: true }
		],
		ctx,
		urlFor
	);

	it('renvoie les managers à charger avec leur URL, sans les recharger ensuite', () => {
		const stack = makeStack();
		const first = stack.sync(plans);
		expect(first.map((p) => p.url)).toEqual(['u/geopotential_height_500hPa', 'u/cloud_cover_low']);
		expect(stack.sync(plans)).toEqual([]);
		expect(stack.vectorManagers()).toEqual([first[0].manager]);
	});

	it('détruit les couches retirées du plan', () => {
		const stack = makeStack();
		const [vector] = stack.sync(plans);
		const destroy = vi.spyOn(vector.manager, 'destroy');
		expect(stack.sync([plans[1]])).toEqual([]);
		expect(destroy).toHaveBeenCalledOnce();
		expect(stack.vectorManagers()).toEqual([]);
	});
});
