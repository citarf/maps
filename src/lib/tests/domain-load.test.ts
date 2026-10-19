import { describe, expect, it, vi } from 'vitest';

import { createDomainLoader } from '$lib/domain-load';
import { DomainUnavailableError } from '$lib/metadata';

/** Chargements pilotés à la main : chaque `load()` attend sa résolution. */
function harness(initial: string) {
	let current = initial;
	const pending: { domain: string; resolve: () => void; reject: (e: unknown) => void }[] = [];
	const warn = vi.fn();
	const switchTo = vi.fn((value: string) => {
		current = value;
	});
	const loadDomain = createDomainLoader({
		load: () =>
			new Promise<void>((resolve, reject) => pending.push({ domain: current, resolve, reject })),
		currentDomain: () => current,
		labelOf: (value) => ({ arome_france: 'Arome', ecmwf_ifs025: 'ECMWF' })[value] ?? value,
		warn,
		switchTo,
		defaultDomain: 'arome_france'
	});
	/** Sélection d'un domaine, comme l'abonnement de `+page.svelte`. */
	const select = (value: string) => {
		current = value;
		return loadDomain(value);
	};
	/** `n`-ième chargement en attente du domaine (0 = le plus ancien). */
	const answer = (value: string, n = 0) => pending.filter((p) => p.domain === value)[n];
	const unavailable = () => new DomainUnavailableError('Weather AI : rien de publié.');
	return { select, answer, unavailable, warn, switchTo, current: () => current };
}

describe('createDomainLoader : repli d’un modèle sans échéance publiée', () => {
	it('revient au dernier modèle chargé et le dit', async () => {
		const h = harness('arome_france');
		const arome = h.select('ecmwf_ifs025');
		h.answer('ecmwf_ifs025').resolve();
		expect(await arome).toBe('loaded');

		const weather = h.select('weather_ai_wnc_mini');
		h.answer('weather_ai_wnc_mini').reject(h.unavailable());
		expect(await weather).toBe('unavailable');
		expect(h.warn).toHaveBeenCalledWith('Weather AI : rien de publié. Retour à ECMWF.');
		expect(h.current()).toBe('ecmwf_ifs025');
	});

	it('premier chargement (lien direct) : repli sur le modèle par défaut', async () => {
		const h = harness('weather_ai_wnc_mini');
		const weather = h.select('weather_ai_wnc_mini');
		h.answer('weather_ai_wnc_mini').reject(h.unavailable());
		expect(await weather).toBe('unavailable');
		expect(h.switchTo).toHaveBeenCalledWith('arome_france');
		expect(h.warn).toHaveBeenCalledWith('Weather AI : rien de publié. Retour à Arome.');
	});

	it('réponse tardive d’un modèle déjà quitté : ignorée, le choix suivant reste', async () => {
		// Arome chargé ; Weather AI choisi (en attente) ; puis ECMWF (en attente).
		const h = harness('arome_france');
		const arome = h.select('arome_france');
		h.answer('arome_france').resolve();
		await arome;
		const weather = h.select('weather_ai_wnc_mini');
		const ecmwf = h.select('ecmwf_ifs025');

		// Le 404/404 de Weather AI arrive après la sélection d'ECMWF.
		h.answer('weather_ai_wnc_mini').reject(h.unavailable());
		expect(await weather).toBe('stale');
		expect(h.warn).not.toHaveBeenCalled();
		expect(h.switchTo).not.toHaveBeenCalled();
		expect(h.current()).toBe('ecmwf_ifs025');

		h.answer('ecmwf_ifs025').resolve();
		expect(await ecmwf).toBe('loaded');
		expect(h.current()).toBe('ecmwf_ifs025');
	});

	it('même domaine resélectionné : seule la dernière requête décide', async () => {
		const h = harness('arome_france');
		const first = h.select('weather_ai_wnc_mini');
		const second = h.select('weather_ai_wnc_mini');
		h.answer('weather_ai_wnc_mini', 0).reject(h.unavailable());
		expect(await first).toBe('stale');
		expect(h.switchTo).not.toHaveBeenCalled();
		// La requête la plus récente voit le premier run publié entre-temps.
		h.answer('weather_ai_wnc_mini', 1).resolve();
		expect(await second).toBe('loaded');
		expect(h.current()).toBe('weather_ai_wnc_mini');
	});

	it('un chargement dépassé réussi ne devient pas le modèle de repli', async () => {
		const h = harness('arome_france');
		const arome = h.select('arome_france');
		h.answer('arome_france').resolve();
		await arome;
		const ecmwf = h.select('ecmwf_ifs025');
		const weather = h.select('weather_ai_wnc_mini');
		h.answer('ecmwf_ifs025').resolve(); // ECMWF répond après le choix de Weather AI
		await ecmwf;
		h.answer('weather_ai_wnc_mini').reject(h.unavailable());
		expect(await weather).toBe('unavailable');
		expect(h.current()).toBe('arome_france');
	});

	it('les autres erreurs restent propagées', async () => {
		const h = harness('arome_france');
		const weather = h.select('weather_ai_wnc_mini');
		h.answer('weather_ai_wnc_mini').reject(new Error('HTTP 500'));
		await expect(weather).rejects.toThrow('HTTP 500');
		expect(h.warn).not.toHaveBeenCalled();
	});
});
