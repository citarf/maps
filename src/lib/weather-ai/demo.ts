// Démonstration hors API (mode `fixture` du flag des cônes) : trajectoires
// réelles archivées du run de référence et cônes fictifs construits d'après le
// schéma, du MÊME run — jamais combinés à un run servi par l'API. Sert à juger
// le rendu des cônes tant que le portail ne les sert pas.
// Les fixtures sont importées dynamiquement : hors du bundle principal.
import { validateTracks } from './loader';
import { PRODUCT_SPECS } from './products';

import type { LoadedRun, TracksFrame } from './loader';
import type { TracksProduct } from './tracks';

const TRACKS_ID = 'global-cyclone-tracks-1deg';

interface TracksFixture {
	attribution: string;
	license_notice: string;
	frames: TracksProduct[];
}

export async function loadDemoRun(signal?: AbortSignal): Promise<LoadedRun> {
	const mod = await import('./fixtures/tracks-reference.fixture.json');
	signal?.throwIfAborted();
	const fx = mod.default as unknown as TracksFixture;
	const product = {
		productId: TRACKS_ID,
		spec: PRODUCT_SPECS[TRACKS_ID],
		attribution: fx.attribution,
		licenseNotice: fx.license_notice
	};
	const frames: TracksFrame[] = [...fx.frames]
		.sort((a, b) => a.valid_time.localeCompare(b.valid_time))
		.map((p) => ({ validTime: p.valid_time, product: validateTracks(p, product, p.valid_time) }));
	const first = fx.frames[0];
	if (fx.frames.some((f) => f.run_id !== first.run_id || f.snapshot_id !== first.snapshot_id)) {
		throw new Error('Fixture de démonstration incohérente');
	}
	return {
		runId: first.run_id,
		snapshotId: first.snapshot_id,
		publishedAt: '2026-10-18T12:02:35Z',
		initTime: first.init_time,
		available: [product],
		ignored: [],
		loaded: { [TRACKS_ID]: { kind: 'tracks', product, frames } },
		demo: true
	};
}
