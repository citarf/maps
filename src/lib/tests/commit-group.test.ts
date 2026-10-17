import { describe, expect, it, vi } from 'vitest';

import { CommitGroup, type Committable } from '$lib/commit-group';

const fake = (ready = false) => ({
	ready,
	isReady() {
		return this.ready;
	},
	commitNow: vi.fn()
});

const makeGroup = () => {
	const hooks = { onSettled: vi.fn(), onFlushed: vi.fn() };
	return { group: new CommitGroup<Committable>(hooks), hooks };
};

describe('CommitGroup', () => {
	it('committe tout le groupe quand tous les membres sont prêts', () => {
		const { group, hooks } = makeGroup();
		const a = fake();
		const b = fake();
		group.begin([a, b]);
		a.ready = true;
		group.tryFlush();
		expect(a.commitNow).not.toHaveBeenCalled();
		b.ready = true;
		group.tryFlush();
		expect(a.commitNow).toHaveBeenCalledOnce();
		expect(b.commitNow).toHaveBeenCalledOnce();
		expect(hooks.onSettled).toHaveBeenCalledOnce();
		expect(hooks.onFlushed).toHaveBeenCalledOnce();
	});

	it('un groupe vide se termine tout de suite', () => {
		const { group, hooks } = makeGroup();
		group.begin([]);
		expect(hooks.onSettled).toHaveBeenCalledOnce();
	});

	it('drop : un membre en erreur ne bloque pas les autres', () => {
		const { group } = makeGroup();
		const a = fake(true);
		const b = fake();
		group.begin([a, b]);
		group.drop(b);
		expect(a.commitNow).toHaveBeenCalledOnce();
	});

	it('forget : un membre détruit ne bloque pas les autres ; sans effet hors du groupe', () => {
		const { group, hooks } = makeGroup();
		const a = fake(true);
		const b = fake();
		group.begin([a]);
		group.forget(b);
		expect(a.commitNow).not.toHaveBeenCalled();
		group.add(b);
		group.forget(b);
		expect(a.commitNow).toHaveBeenCalledOnce();
		expect(hooks.onSettled).toHaveBeenCalledOnce();
	});

	it('add fusionne dans le groupe en vol (les membres en attente sont committés)', () => {
		const { group } = makeGroup();
		const raster = fake();
		const vector = fake();
		const overlay = fake();
		group.begin([raster, vector]);
		group.add(overlay);
		overlay.ready = true;
		group.tryFlush();
		expect(overlay.commitNow).not.toHaveBeenCalled();
		raster.ready = true;
		vector.ready = true;
		group.tryFlush();
		expect(raster.commitNow).toHaveBeenCalledOnce();
		expect(vector.commitNow).toHaveBeenCalledOnce();
		expect(overlay.commitNow).toHaveBeenCalledOnce();
	});
});

describe('CommitGroup.begin avec report', () => {
	it('conserve un membre en vol accepté par `keep` (superposition pas encore prête)', () => {
		const { group } = makeGroup();
		const overlay = fake();
		const raster = fake();
		group.begin([overlay]);
		// Nouveau chargement primaire avant que la superposition ne soit prête.
		group.begin([raster], (mgr) => mgr === overlay);
		raster.ready = true;
		group.tryFlush();
		expect(raster.commitNow).not.toHaveBeenCalled();
		overlay.ready = true;
		group.tryFlush();
		expect(overlay.commitNow).toHaveBeenCalledOnce();
		expect(raster.commitNow).toHaveBeenCalledOnce();
	});

	it('sans report (aucune superposition), le groupe en vol est remplacé comme avant', () => {
		const { group, hooks } = makeGroup();
		const oldRaster = fake();
		const raster = fake(true);
		group.begin([oldRaster]);
		group.begin([raster], () => false);
		group.tryFlush();
		expect(raster.commitNow).toHaveBeenCalledOnce();
		expect(oldRaster.commitNow).not.toHaveBeenCalled();
		expect(hooks.onSettled).toHaveBeenCalledOnce();
		group.begin([], () => false);
		expect(hooks.onSettled).toHaveBeenCalledTimes(2);
	});

	it('un membre rechargé et en vol n’est pas dupliqué', () => {
		const { group } = makeGroup();
		const overlay = fake(true);
		group.begin([overlay]);
		group.begin([overlay], () => true);
		group.tryFlush();
		expect(overlay.commitNow).toHaveBeenCalledOnce();
	});
});
