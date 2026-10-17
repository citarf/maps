import { get } from 'svelte/store';

import { toast } from 'svelte-sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { overlays } from '$lib/stores/composition';
import { opacity2, url as urlStore } from '$lib/stores/preferences';
import { layer2Enabled, variable2 } from '$lib/stores/variables';

import { urlParamsToPreferences } from '$lib/url';

describe('urlParamsToPreferences — 2nd layer', () => {
	beforeEach(() => {
		variable2.set('precipitation');
		layer2Enabled.set(false);
		opacity2.set(70);
	});

	it('hydrates variable2, opacity2, layer2 from URL', () => {
		urlStore.set(new URL('http://localhost/?variable2=cloud_cover_low&opacity2=40&layer2=true'));
		urlParamsToPreferences();
		expect(get(variable2)).toBe('cloud_cover_low');
		expect(get(opacity2)).toBe(40);
		expect(get(layer2Enabled)).toBe(true);
	});

	it('omits layer2 params from URL when at defaults', () => {
		urlStore.set(new URL('http://localhost/'));
		urlParamsToPreferences();
		const u = get(urlStore);
		expect(u.searchParams.get('variable2')).toBeNull();
		expect(u.searchParams.get('opacity2')).toBeNull();
		expect(u.searchParams.get('layer2')).toBeNull();
	});
});

vi.mock('svelte-sonner', () => ({ toast: vi.fn() }));

describe('urlParamsToPreferences — overlays', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		overlays.set([]);
	});

	it("hydrate overlays depuis l'URL", () => {
		urlStore.set(new URL('http://localhost/?overlays=pressure_msl:c2'));
		urlParamsToPreferences();
		expect(get(overlays)).toEqual([
			{ variable: 'pressure_msl', contours: true, contourInterval: 2 }
		]);
	});

	it('ignore un paramètre overlays invalide et prévient', () => {
		overlays.set([{ variable: 'pressure_msl', contours: true }]);
		urlStore.set(new URL('http://localhost/?overlays=%25%25%25'));
		urlParamsToPreferences();
		expect(get(overlays)).toEqual([{ variable: 'pressure_msl', contours: true }]);
		expect(toast).toHaveBeenCalled();
	});

	// Lien partagé : l'URL omet `overlays` quand la liste est vide. Sans `overlays`,
	// un lien explicite (domaine/variable) désigne donc une carte SANS superposition —
	// les superpositions mémorisées localement ne doivent pas s'y ajouter.
	it('un lien explicite sans overlays efface les superpositions mémorisées', () => {
		overlays.set([{ variable: 'pressure_msl', contours: true }]);
		urlStore.set(new URL('http://localhost/?domain=ecmwf_ifs025&variable=temperature_2m'));
		urlParamsToPreferences();
		expect(get(overlays)).toEqual([]);
		expect(get(urlStore).searchParams.get('overlays')).toBeNull();
	});

	it('overlays vide efface les superpositions mémorisées', () => {
		overlays.set([{ variable: 'pressure_msl', contours: true }]);
		urlStore.set(new URL('http://localhost/?overlays='));
		urlParamsToPreferences();
		expect(get(overlays)).toEqual([]);
		expect(get(urlStore).searchParams.get('overlays')).toBeNull();
	});

	it("une URL nue restaure les superpositions mémorisées et les écrit dans l'URL", () => {
		overlays.set([{ variable: 'pressure_msl', contours: true }]);
		urlStore.set(new URL('http://localhost/'));
		urlParamsToPreferences();
		expect(get(overlays)).toEqual([{ variable: 'pressure_msl', contours: true }]);
		expect(get(urlStore).searchParams.get('overlays')).toBe('pressure_msl:c');
	});
});
