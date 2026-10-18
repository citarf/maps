import { describe, expect, it, vi } from 'vitest';

import { type SlotAdapter, createLayerSwitcher } from '$lib/weather-ai/layer-switcher';
import { RunScopedCache, renderKey } from '$lib/weather-ai/render-cache';

const deferred = <T>() => {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
};

/** Fausse carte : journal des opérations, chargement des slots piloté par le test. */
function fakeMap() {
	const log: string[] = [];
	const slots = new Map<string, { plan: string; loaded: boolean; visible: boolean }>();
	const listeners = new Set<() => void>();
	const adapter: SlotAdapter<string> = {
		mount: (slot, plan) => {
			slots.set(slot, { plan, loaded: false, visible: false });
			log.push(`mount ${slot} ${plan}`);
		},
		loaded: (slot) => slots.get(slot)?.loaded ?? true,
		show: (slot) => {
			slots.get(slot)!.visible = true;
			log.push(`show ${slot} ${slots.get(slot)!.plan}`);
			// Invariant : jamais deux slots visibles en même temps après la commutation.
		},
		unmount: (slot) => {
			if (slots.delete(slot)) log.push(`unmount ${slot}`);
		},
		exists: (slot) => slots.has(slot),
		onChange: (cb) => {
			listeners.add(cb);
			return () => listeners.delete(cb);
		}
	};
	const load = (plan: string) => {
		for (const s of slots.values()) if (s.plan === plan) s.loaded = true;
		for (const cb of [...listeners]) cb();
	};
	const visible = () => [...slots.values()].filter((s) => s.visible).map((s) => s.plan);
	const purge = () => slots.clear();
	return { adapter, log, load, visible, purge, slots };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createLayerSwitcher', () => {
	it('ne montre un état qu’une fois toutes ses sources chargées, puis retire l’ancien', async () => {
		const m = fakeMap();
		const sw = createLayerSwitcher(m.adapter);
		const a = sw.commit('A', async () => 'A');
		await flush();
		expect(m.visible()).toEqual([]);
		m.load('A');
		expect(await a).toBe('shown');
		expect(m.visible()).toEqual(['A']);

		const b = sw.commit('B', async () => 'B');
		await flush();
		// B monté hors écran : A reste seul visible tant que B charge.
		expect(m.visible()).toEqual(['A']);
		m.load('B');
		expect(await b).toBe('shown');
		expect(m.visible()).toEqual(['B']);
		expect(m.log.indexOf('show s2 B')).toBeLessThan(m.log.indexOf('unmount s1'));
	});

	it('course : une préparation A qui termine après B n’est jamais affichée', async () => {
		const m = fakeMap();
		const sw = createLayerSwitcher(m.adapter);
		const prepA = deferred<string>();
		const a = sw.commit('A', () => prepA.promise);
		const b = sw.commit('B', async () => 'B');
		await flush();
		m.load('B');
		expect(await b).toBe('shown');
		prepA.resolve('A'); // A termine en dernier (ex. rasterisation lente)
		expect(await a).toBe('stale');
		expect(m.visible()).toEqual(['B']);
		expect(m.log.some((l) => l.includes(' A'))).toBe(false);
	});

	it('course : un slot en cours de chargement dépassé est retiré sans être montré', async () => {
		const m = fakeMap();
		const sw = createLayerSwitcher(m.adapter);
		const a = sw.commit('A', async () => 'A');
		await flush(); // A monté, pas chargé
		const b = sw.commit('B', async () => 'B');
		await flush();
		m.load('A'); // A finit de charger trop tard
		m.load('B');
		expect(await a).toBe('stale');
		expect(await b).toBe('shown');
		expect(m.visible()).toEqual(['B']);
		expect(m.log).not.toContain('show s1 A');
		expect(m.slots.size).toBe(1);
	});

	it('un état identique déjà affiché n’est pas recommuté, sauf après un re-style', async () => {
		const m = fakeMap();
		const sw = createLayerSwitcher(m.adapter);
		const prepare = vi.fn(async () => 'A');
		const first = sw.commit('A', prepare);
		await flush();
		m.load('A');
		await first;
		expect(await sw.commit('A', prepare)).toBe('unchanged');
		m.purge(); // setStyle purge les sources
		const again = sw.commit('A', prepare);
		await flush();
		m.load('A');
		expect(await again).toBe('shown');
		expect(prepare).toHaveBeenCalledTimes(2);
	});

	it('revenir à l’état affiché annule un commit en vol', async () => {
		const m = fakeMap();
		const sw = createLayerSwitcher(m.adapter);
		const a = sw.commit('A', async () => 'A');
		await flush();
		m.load('A');
		await a;
		const prepB = deferred<string>();
		const b = sw.commit('B', () => prepB.promise);
		const back = sw.commit('A', async () => 'A');
		prepB.resolve('B');
		await flush();
		m.load('A');
		expect(await b).toBe('stale');
		expect(await back).toBe('shown');
		expect(m.visible()).toEqual(['A']);
	});

	it('un plan vide efface tout', async () => {
		const m = fakeMap();
		const sw = createLayerSwitcher(m.adapter);
		const a = sw.commit('A', async () => 'A');
		await flush();
		m.load('A');
		await a;
		expect(await sw.commit('none', async () => null)).toBe('cleared');
		expect(m.slots.size).toBe(0);
	});

	it('délai dépassé : garde l’état affiché, retire et nettoie le slot incomplet', async () => {
		vi.useFakeTimers();
		try {
			const m = fakeMap();
			const off = vi.fn();
			const onChange = m.adapter.onChange;
			m.adapter.onChange = (cb) => {
				const unsubscribe = onChange(cb);
				return () => {
					off();
					unsubscribe();
				};
			};
			const sw = createLayerSwitcher(m.adapter, { timeoutMs: 1000 });
			const a = sw.commit('A', async () => 'A');
			await vi.advanceTimersByTimeAsync(0);
			m.load('A');
			expect(await a).toBe('shown');
			const listenersAfterA = off.mock.calls.length;

			const b = sw.commit('B', async () => 'B'); // B ne se charge jamais
			await vi.advanceTimersByTimeAsync(1001);
			expect(await b).toBe('timeout');
			expect(m.visible()).toEqual(['A']); // A toujours affiché
			expect(m.log).not.toContain('show s2 B'); // B jamais affiché incomplet
			expect(m.log).toContain('unmount s2'); // B retiré (sources comprises)
			expect(m.log).not.toContain('unmount s1');
			expect(m.slots.size).toBe(1);
			expect(off.mock.calls.length).toBe(listenersAfterA + 1); // écouteur retiré
			expect(vi.getTimerCount()).toBe(0); // minuterie de garde nettoyée
			expect(sw.activeSlot).toBe('s1');

			// Réessai (prochain relevé) : B finit par s'afficher s'il se charge.
			expect(await sw.commit('A', async () => 'A')).toBe('unchanged');
			const retry = sw.commit('B', async () => 'B');
			await vi.advanceTimersByTimeAsync(0);
			m.load('B');
			expect(await retry).toBe('shown');
			expect(m.visible()).toEqual(['B']);
		} finally {
			vi.useRealTimers();
		}
	});

	it('délai dépassé sans état précédent : rien n’est affiché', async () => {
		vi.useFakeTimers();
		try {
			const m = fakeMap();
			const sw = createLayerSwitcher(m.adapter, { timeoutMs: 1000 });
			const a = sw.commit('A', async () => 'A');
			await vi.advanceTimersByTimeAsync(1001);
			expect(await a).toBe('timeout');
			expect(m.slots.size).toBe(0);
			expect(sw.activeSlot).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('RunScopedCache', () => {
	it('refuse et libère une écriture d’un run révolu (course de rasterisation)', () => {
		const disposed: string[] = [];
		const cache = new RunScopedCache<string>((v) => disposed.push(v));
		const genA = cache.scope('runA');
		const genB = cache.scope('runB'); // bascule pendant la rasterisation de A
		expect(cache.set(genA, renderKey('runA', 'p', 't'), 'blob:A')).toBe(false);
		expect(disposed).toEqual(['blob:A']);
		expect(cache.get(renderKey('runA', 'p', 't'))).toBeUndefined();
		expect(cache.set(genB, renderKey('runB', 'p', 't'), 'blob:B')).toBe(true);
		expect(cache.get(renderKey('runB', 'p', 't'))).toBe('blob:B');
	});

	it('purge et libère les entrées du run précédent à la bascule', () => {
		const disposed: string[] = [];
		const cache = new RunScopedCache<string>((v) => disposed.push(v));
		const gen = cache.scope('runA');
		cache.set(gen, renderKey('runA', 'p', 't1'), 'blob:1');
		cache.scope('runA'); // même run : rien n'est purgé
		expect(cache.size).toBe(1);
		cache.scope('runB');
		expect(cache.size).toBe(0);
		expect(disposed).toEqual(['blob:1']);
	});

	it('delete retire et libère une entrée (raster d’un slot qui ne s’est pas chargé)', () => {
		const disposed: string[] = [];
		const cache = new RunScopedCache<string>((v) => disposed.push(v));
		const gen = cache.scope('runA');
		cache.set(gen, 'k', 'blob:k');
		cache.delete('k');
		cache.delete('absent');
		expect(cache.get('k')).toBeUndefined();
		expect(disposed).toEqual(['blob:k']);
	});

	it('la clé distingue run, produit et échéance', () => {
		expect(renderKey('r', 'global-mslp-1deg', '2026-10-18T12:00:00Z')).toBe(
			'r:global-mslp-1deg:2026-10-18T12:00:00Z'
		);
		expect(renderKey('r1', 'p', 't')).not.toBe(renderKey('r2', 'p', 't'));
	});
});
