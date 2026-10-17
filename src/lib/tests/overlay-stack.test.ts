import { describe, expect, it, vi } from 'vitest';

import { CommitGroup, type Committable } from '$lib/commit-group';
import {
	OverlayStack,
	desiredOverlayLayers,
	ensureAnchorLayer,
	planOverlayUpdates
} from '$lib/overlay-stack';

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

	const makeStack = (onDestroy: (mgr: Committable) => void = () => {}) =>
		new OverlayStack(fakeMap(), {
			onReady: () => {},
			onError: () => {},
			onDestroy,
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

describe('OverlayStack et groupe de commit', () => {
	const fakeMap = () =>
		({
			style: { getSource: () => undefined },
			getLayer: () => undefined
		}) as unknown as maplibregl.Map;
	const ready = () => ({ isReady: () => true, commitNow: vi.fn() });
	const plans = desiredOverlayLayers(
		[{ variable: 'geopotential_height_500hPa', contours: true }],
		ctx,
		urlFor
	);

	const setup = () => {
		const hooks = { onSettled: vi.fn(), onFlushed: vi.fn() };
		const group = new CommitGroup<Committable>(hooks);
		const stack = new OverlayStack(fakeMap(), {
			onReady: () => group.tryFlush(),
			onError: (mgr) => group.drop(mgr),
			onDestroy: (mgr) => group.forget(mgr),
			rasterBefore: () => 'r',
			vectorBefore: () => 'v',
			layers: () => []
		});
		return { group, hooks, stack };
	};

	it('sync A puis sync sans A pendant un groupe en vol : le groupe se termine', () => {
		const { group, hooks, stack } = setup();
		const raster = ready();
		const vector = ready();
		const [overlay] = stack.sync(plans);
		group.begin([raster, vector, overlay.manager]);
		group.tryFlush();
		// La superposition n'a pas fini de charger : raster/vecteur attendent.
		expect(raster.commitNow).not.toHaveBeenCalled();
		expect(stack.sync([])).toEqual([]);
		expect(raster.commitNow).toHaveBeenCalledOnce();
		expect(vector.commitNow).toHaveBeenCalledOnce();
		expect(hooks.onSettled).toHaveBeenCalledOnce();
	});

	it('destroyAll pendant un groupe en vol : le groupe se termine', () => {
		const { group, hooks, stack } = setup();
		const raster = ready();
		const [overlay] = stack.sync(plans);
		group.begin([raster, overlay.manager]);
		stack.destroyAll();
		expect(raster.commitNow).toHaveBeenCalledOnce();
		expect(hooks.onSettled).toHaveBeenCalledOnce();
	});
});

describe('signature de rendu', () => {
	const base = { variable: 'cloud_cover_low', raster: true };
	const vec = { variable: 'geopotential_height_500hPa', contours: true };

	it('recharge un aplat dont seule l’opacité change', () => {
		const before = desiredOverlayLayers([base], ctx, urlFor);
		const after = desiredOverlayLayers([{ ...base, opacity: 0.5 }], ctx, urlFor);
		const current = new Map([[before[0].key, before[0].url]]);
		expect(planOverlayUpdates(current, before).update).toEqual([]);
		expect(planOverlayUpdates(current, after).update).toEqual(after);
	});

	it('recharge un vecteur dont seule l’épaisseur change', () => {
		const stack = new OverlayStack(
			{
				style: { getSource: () => undefined },
				getLayer: () => undefined
			} as unknown as maplibregl.Map,
			{
				onReady: () => {},
				onError: () => {},
				onDestroy: () => {},
				rasterBefore: () => 'r',
				vectorBefore: () => 'v',
				layers: () => []
			}
		);
		stack.sync(desiredOverlayLayers([vec], ctx, urlFor));
		expect(stack.sync(desiredOverlayLayers([vec], ctx, urlFor))).toEqual([]);
		expect(stack.sync(desiredOverlayLayers([{ ...vec, lineWidth: 2 }], ctx, urlFor))).toHaveLength(
			1
		);
		expect(stack.sync(desiredOverlayLayers([{ ...vec, lineWidth: 2 }], ctx, urlFor))).toEqual([]);
	});
});

describe('ensureAnchorLayer', () => {
	const recordingMap = (existing: string[]) => {
		const layers = new Set(existing);
		const calls: [unknown, string | undefined][] = [];
		const map = {
			getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
			addLayer: (spec: { id: string }, before?: string) => {
				calls.push([spec, before]);
				layers.add(spec.id);
			}
		} as unknown as maplibregl.Map;
		return { map, calls };
	};

	it('ajoute une couche invisible sans source, une seule fois, sous la couche donnée', () => {
		const { map, calls } = recordingMap(['place_label_other']);
		ensureAnchorLayer(map, 'anchor', 'place_label_other');
		ensureAnchorLayer(map, 'anchor', 'place_label_other');
		expect(calls).toEqual([
			[{ id: 'anchor', type: 'background', layout: { visibility: 'none' } }, 'place_label_other']
		]);
	});

	it('se pose en haut de la pile si la couche de référence est absente', () => {
		const { map, calls } = recordingMap([]);
		ensureAnchorLayer(map, 'anchor', 'missing');
		expect(calls[0][1]).toBeUndefined();
	});
});

describe('OverlayStack.owns', () => {
	it('reconnaît ses managers, plus après leur retrait', () => {
		const stack = new OverlayStack(
			{
				style: { getSource: () => undefined },
				getLayer: () => undefined
			} as unknown as maplibregl.Map,
			{
				onReady: () => {},
				onError: () => {},
				onDestroy: () => {},
				rasterBefore: () => 'r',
				vectorBefore: () => 'v',
				layers: () => []
			}
		);
		const [{ manager }] = stack.sync(
			desiredOverlayLayers([{ variable: 'cloud_cover_low', raster: true }], ctx, urlFor)
		);
		expect(stack.owns(manager)).toBe(true);
		stack.sync([]);
		expect(stack.owns(manager)).toBe(false);
	});
});
