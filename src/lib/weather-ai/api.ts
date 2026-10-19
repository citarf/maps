// Client HTTP de l'API Weather AI du portail (lecture seule, GET public).
//
// Contrats de référence : infoclimat-labs/weather-ai (`docs/front-carto-integration.md`,
// `schema/carto-grid-product.schema.json`, `schema/cyclone-tracks-product.schema.json`).
// Les URI `s3://…` des réponses sont de la provenance : jamais téléchargées.

/** Entrée du catalogue : un couple produit × échéance du run actif. */
export interface CatalogEntry {
	product_id: string;
	run_id: string;
	valid_time: string;
	sha256: string;
	snapshot_id: string;
	license_notice: string;
	attribution: string;
	experimental: boolean;
}

export interface Catalog {
	run_id: string;
	run_date: string;
	published_at: string;
	experimental: boolean;
	produits: CatalogEntry[];
}

export interface RunEntry {
	run_id: string;
	init_time: string;
	published_at: string;
	snapshot_id: string;
	valid_times: string[];
}

export interface Runs {
	runs: RunEntry[];
}

export interface TimelineFrame {
	product_id: string;
	run_id: string;
	valid_time: string;
	snapshot_id: string;
}

export interface Timeline {
	product_id: string;
	run_id: string;
	snapshot_id: string;
	frames: TimelineFrame[];
}

/** Réponse de `/products/{id}/data` : le document est dans `product`. */
export interface DataResponse<P> {
	attribution: string;
	license_notice: string;
	experimental: boolean;
	product: P;
}

/** Erreur HTTP de l'API (`application/problem+json` pour les 4xx). */
export class WeatherAiHttpError extends Error {
	constructor(
		readonly status: number,
		readonly url: string,
		detail: string
	) {
		super(`HTTP ${status} ${url}${detail ? ` ${detail}` : ''}`);
		this.name = 'WeatherAiHttpError';
	}
}

/**
 * GET JSON : toute réponse non `ok` est une erreur (le 404 d'un produit ou d'un
 * `valid_time` inconnu arrive en problem+json, jamais comme un document vide).
 */
export async function getJson<T>(
	url: string,
	signal?: AbortSignal,
	fetchImpl: typeof fetch = fetch
): Promise<T> {
	const r = await fetchImpl(url, { signal });
	if (!r.ok) {
		let detail = '';
		try {
			const p = (await r.json()) as { detail?: string; title?: string };
			detail = p.detail ?? p.title ?? '';
		} catch {
			// corps absent ou non JSON : le statut suffit
		}
		throw new WeatherAiHttpError(r.status, url, detail);
	}
	return (await r.json()) as T;
}

export const catalogUrl = (base: string) => `${base}/products`;
export const runsUrl = (base: string) => `${base}/runs`;
export const timelineUrl = (base: string, productId: string) =>
	`${base}/products/${encodeURIComponent(productId)}/timeline`;
export const dataUrl = (base: string, productId: string, validTime: string) =>
	`${base}/products/${encodeURIComponent(productId)}/data?valid_time=${encodeURIComponent(validTime)}`;
