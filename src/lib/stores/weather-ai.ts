// État des couches Weather AI (cartes expérimentales cyclones, onglet « Cyclones IA »).
// Seules les bascules de couches sont persistées ; le run, l'échéance et le
// statut se rechargent depuis l'API (données immuables par run, catalogue relu).
import { writable } from 'svelte/store';

import { persisted } from 'svelte-persisted-store';

import type { ConesProduct } from '$lib/weather-ai/cones';
import type { LoadedRun } from '$lib/weather-ai/loader';
import type { ProductKind } from '$lib/weather-ai/products';

export type WeatherAiLayers = Record<ProductKind, boolean>;

export const DEFAULT_WEATHER_AI_LAYERS: WeatherAiLayers = {
	mslp: false,
	existence: false,
	tracks: false,
	cones: false
};

export const weatherAiLayers = persisted<WeatherAiLayers>(
	'weather-ai-layers',
	DEFAULT_WEATHER_AI_LAYERS,
	{
		// Forme tolérante : clé manquante → défaut, valeur non booléenne → false.
		beforeRead: (v) => ({
			...DEFAULT_WEATHER_AI_LAYERS,
			...Object.fromEntries(
				Object.entries(v ?? {}).filter(
					([k, b]) => k in DEFAULT_WEATHER_AI_LAYERS && typeof b === 'boolean'
				)
			)
		})
	}
);

/** Run affiché. Remplacé d'un bloc (bascule atomique), jamais complété avec un autre run. */
export const weatherAiRun = writable<LoadedRun | undefined>(undefined);

/** Échéance affichée (`valid_time` ISO UTC du run affiché). */
export const weatherAiTime = writable<string | undefined>(undefined);

export interface WeatherAiStatus {
	state: 'idle' | 'loading' | 'ready' | 'error';
	/** Message d'erreur ; le run affiché, s'il y en a un, reste en place. */
	message?: string;
}
export const weatherAiStatus = writable<WeatherAiStatus>({ state: 'idle' });

/** Cônes du run affiché (même `run_id`), ou la raison de leur absence. */
export const weatherAiCones = writable<{
	runId: string;
	doc: ConesProduct | null;
	message?: string;
} | null>(null);
