import { describe, expect, it } from 'vitest';

import { cardSummary, displayedAfterCommit } from '$lib/weather-ai/displayed';

import type { LoadedRun } from '$lib/weather-ai/loader';

const run = (runId: string, initTime = '2026-10-18T06:00:00Z'): LoadedRun => ({
	runId,
	snapshotId: 's',
	publishedAt: '2026-10-18T13:58:28Z',
	initTime,
	available: [],
	ignored: [],
	loaded: {}
});

const A = { run: run('runA'), vt: '2026-10-18T12:00:00Z' };
const B = { run: run('runB'), vt: '2026-10-19T00:00:00Z' };
const NOW = Date.parse('2026-10-18T09:00:00Z');
const TIMEOUT = {
	state: 'error',
	message: "Affichage Weather AI incomplet (délai dépassé) : l'état précédent est conservé."
};

describe('displayedAfterCommit', () => {
	it('seul un slot montré ou effacé change l’état affiché', () => {
		const shownA = displayedAfterCommit('shown', A, null, true);
		expect(shownA).toEqual({
			runId: 'runA',
			validTime: A.vt,
			initTime: '2026-10-18T06:00:00Z',
			demo: false
		});
		for (const r of ['timeout', 'stale', 'unchanged'] as const) {
			expect(displayedAfterCommit(r, B, shownA, true)).toBe(shownA);
		}
		expect(displayedAfterCommit('cleared', B, shownA, false)).toBeNull();
	});
});

describe('re-style puis délai dépassé (slot actif disparu)', () => {
	it('rien n’est plus affiché : l’état affiché est effacé, quel que soit le résultat', () => {
		const shownA = displayedAfterCommit('shown', A, null, true);
		// setStyle a purgé le slot de A, puis le rechargement a dépassé le délai.
		for (const r of ['timeout', 'stale', 'unchanged', 'shown'] as const) {
			expect(displayedAfterCommit(r, A, shownA, false)).toBeNull();
		}
	});

	it('la carte annonce « rien d’affiché » et l’erreur, avec la sélection en attente', () => {
		const shownA = displayedAfterCommit('shown', A, null, true);
		const afterRestyleTimeout = displayedAfterCommit('timeout', A, shownA, false);
		const s = cardSummary(afterRestyleTimeout, { runId: 'runA', validTime: A.vt }, TIMEOUT, NOW);
		expect(s.shown).toBeUndefined();
		expect(s.pending).toBe(true);
		expect(s.error).toBe(TIMEOUT.message);
	});
});

describe('cardSummary', () => {
	it('après sélection de B puis délai dépassé : décrit A (réellement affiché) et montre l’erreur', () => {
		const shownA = displayedAfterCommit('shown', A, null, true);
		const afterTimeout = displayedAfterCommit('timeout', B, shownA, true);
		const s = cardSummary(afterTimeout, { runId: 'runB', validTime: B.vt }, TIMEOUT, NOW);
		expect(s.shown).toMatchObject({ runId: 'runA', lead: '+6 h', utc: '18/10 12:00 UTC' });
		expect(s.shown!.runId).not.toBe('runB');
		expect(s.pending).toBe(true);
		expect(s.error).toBe(TIMEOUT.message);
	});

	it('l’erreur est exposée même sans aucun état affiché', () => {
		const s = cardSummary(
			null,
			{ runId: undefined, validTime: undefined },
			{ state: 'error', message: 'API Weather AI injoignable (réseau ou CORS)' },
			NOW
		);
		expect(s.shown).toBeUndefined();
		expect(s.error).toMatch(/injoignable/);
	});

	it('affichage à jour : pas d’attente, pas d’erreur', () => {
		const shownB = displayedAfterCommit('shown', B, null, true);
		const s = cardSummary(shownB, { runId: 'runB', validTime: B.vt }, { state: 'ready' }, NOW);
		expect(s.pending).toBe(false);
		expect(s.error).toBeUndefined();
		expect(s.shown).toMatchObject({ lead: '+18 h', elapsed: false });
	});

	it('signale une échéance affichée déjà écoulée', () => {
		const shownA = displayedAfterCommit('shown', A, null, true);
		const s = cardSummary(
			shownA,
			{ runId: 'runA', validTime: A.vt },
			{ state: 'ready' },
			Date.parse('2026-10-18T15:00:00Z')
		);
		expect(s.shown!.elapsed).toBe(true);
	});
});

describe('légende : jamais d’affirmation sur une échéance non affichée', () => {
	const RUN6 = run('runA', '2026-10-18T00:00:00Z');
	const TIMES = ['2026-10-18T06:00:00Z', '2026-10-18T12:00:00Z', '2026-10-18T18:00:00Z'];
	const horizon = { first: TIMES[0], last: TIMES[2] };

	it('timeout : affichée 06Z, frise à 15Z résolue à 12Z → pas de « échéance précédente affichée »', () => {
		const shown06 = displayedAfterCommit('shown', { run: RUN6, vt: TIMES[0] }, null, true);
		const afterTimeout = displayedAfterCommit(
			'timeout',
			{ run: RUN6, vt: TIMES[1] },
			shown06,
			true
		);
		const s = cardSummary(
			afterTimeout,
			{ runId: 'runA', validTime: TIMES[1] },
			TIMEOUT,
			NOW,
			{ validTime: TIMES[1], relation: 'between', horizon },
			RUN6.initTime
		);
		expect(s.relation).toBe('between'); // la sélection, elle, tombe entre deux échéances
		expect(s.betweenShown).toBe(false); // mais 12Z n'est pas affichée : on ne l'affirme pas
		expect(s.shown).toMatchObject({ lead: '+6 h', utc: '18/10 06:00 UTC', runId: 'runA' });
		expect(s.requested).toMatchObject({ lead: '+12 h', utc: '18/10 12:00 UTC', sameRun: true });
		expect(s.error).toBe(TIMEOUT.message);
	});

	it('entre deux échéances ET affichée : la phrase est vraie', () => {
		const shown12 = displayedAfterCommit('shown', { run: RUN6, vt: TIMES[1] }, null, true);
		const s = cardSummary(
			shown12,
			{ runId: 'runA', validTime: TIMES[1] },
			{ state: 'ready' },
			NOW,
			{ validTime: TIMES[1], relation: 'between', horizon },
			RUN6.initTime
		);
		expect(s.betweenShown).toBe(true);
		expect(s.requested).toBeUndefined();
	});

	it('changement de run en cours : run et init décrivent le run AFFICHÉ, le nouveau est « demandé »', () => {
		const oldRun = run('runA', '2026-10-18T00:00:00Z');
		const newRun = run('runB', '2026-10-18T06:00:00Z');
		const shownOld = displayedAfterCommit(
			'shown',
			{ run: oldRun, vt: '2026-10-18T18:00:00Z' },
			null,
			true
		);
		// Le nouveau run est committé dans le store, son slot n'est pas encore affiché.
		const s = cardSummary(
			shownOld,
			{ runId: 'runB', validTime: '2026-10-18T18:00:00Z' },
			{ state: 'ready' },
			NOW,
			{ validTime: '2026-10-18T18:00:00Z', relation: 'exact', horizon },
			newRun.initTime
		);
		expect(s.shown).toMatchObject({
			runId: 'runA',
			init: '18/10 00:00 UTC',
			lead: '+18 h'
		});
		expect(s.requested).toMatchObject({ runId: 'runB', sameRun: false, lead: '+12 h' });
		expect(s.pending).toBe(true);
	});
});
