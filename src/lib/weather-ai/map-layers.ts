// Câblage MapLibre des couches Weather AI. Sources dédiées (pattern de
// `departments-layer.ts`) posées AU-DESSUS de toutes les couches : elles ne
// passent pas par le protocole `om://` ni par les SlotManager (documents JSON
// d'une autre API, run et échéances propres). Les grilles sont rasterisées dans
// un canvas (Web Mercator, nord en haut) puis servies en source `image` ; les
// isobares, trajectoires et cônes sont des sources `geojson`.
//
// Affichage atomique : chaque état (run × échéance × couches × cônes × thème)
// est préparé hors écran puis commuté d'un bloc par `layer-switcher.ts` — un
// slot neuf par état, jamais de mise à jour en place d'une source affichée.
// `setStyle` (donc `reloadStyles()`) purge les slots : `syncWeatherAiLayers()`
// est rappelé après chaque re-style et à chaque changement d'état.
import { get } from 'svelte/store';

import * as maplibregl from 'maplibre-gl';

import { basemapTheme } from '$lib/stores/basemap-theme';
import { map as mStore } from '$lib/stores/map';
import {
	weatherAiCones,
	weatherAiLayers,
	weatherAiRun,
	weatherAiStatus,
	weatherAiTime
} from '$lib/stores/weather-ai';

import { CONE_REASON_LABELS, type ConesProduct, coneAt, conesToGeoJson } from './cones';
import { CATALOG_POLL_MS } from './controller';
import { MERCATOR_IMAGE_COORDINATES, renderMercatorRgba } from './grid';
import { createLayerSwitcher } from './layer-switcher';
import { type GridFrame, type LoadedRun, leadHours } from './loader';
import { formatLead, formatUtc, isobarsGeoJson, probabilityColor } from './render';
import { RunScopedCache, renderKey } from './render-cache';
import {
	CANDIDATE_LABEL,
	buildTracks,
	msToKmh,
	tracksToGeoJson,
	windColorExpression
} from './tracks';

import type { WeatherAiLayers } from '$lib/stores/weather-ai';

const RASTER_W = 1024;
const RASTER_H = 1024;

type Fc = GeoJSON.FeatureCollection;

/** Tout ce qu'un slot affiche, préparé avant d'être monté. */
export interface RenderPlan {
	dark: boolean;
	rasterUrl?: string;
	/** Clé de cache du raster, pour le libérer si le slot ne se charge pas. */
	rasterKey?: string;
	isobars?: Fc;
	trackLines?: Fc;
	trackPoints?: Fc;
	cones?: Fc;
	coneCentres?: Fc;
}

// Rendus coûteux mémoïsés pour le run affiché (données immuables) ; une
// rasterisation terminée après une bascule de run est refusée et libérée.
const rasters = new RunScopedCache<string>((url) => URL.revokeObjectURL(url));
const isobars = new RunScopedCache<Fc>();
const tracksCache = new RunScopedCache<ReturnType<typeof buildTracks>>();
const conesCache = new RunScopedCache<ReturnType<typeof conesToGeoJson>>();

const gridFrame = (
	run: LoadedRun,
	kind: 'mslp' | 'existence',
	vt: string
): { productId: string; frame: GridFrame } | undefined => {
	const p = Object.values(run.loaded).find((l) => l.kind === kind);
	if (!p || p.kind === 'tracks') return undefined;
	const frame = p.frames.find((f) => f.validTime === vt);
	return frame && { productId: p.product.productId, frame };
};

async function rasterize(frame: GridFrame): Promise<string> {
	const rgba = renderMercatorRgba(frame.grid, RASTER_W, RASTER_H, probabilityColor);
	const canvas = document.createElement('canvas');
	canvas.width = RASTER_W;
	canvas.height = RASTER_H;
	canvas
		.getContext('2d')!
		.putImageData(new ImageData(new Uint8ClampedArray(rgba), RASTER_W, RASTER_H), 0, 0);
	const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
	if (!blob) throw new Error('rasterisation impossible');
	return URL.createObjectURL(blob);
}

interface PlanInput {
	run: LoadedRun | undefined;
	vt: string | undefined;
	layers: WeatherAiLayers;
	cones: ConesProduct | null;
	dark: boolean;
}

/** Signature de l'état à afficher : deux appels de même signature ne recommutent pas. */
const planSignature = ({ run, vt, layers, cones, dark }: PlanInput) =>
	[
		run?.runId ?? '-',
		Object.keys(run?.loaded ?? {})
			.sort()
			.join(','),
		vt ?? '-',
		Object.entries(layers)
			.filter(([, on]) => on)
			.map(([k]) => k)
			.join(','),
		cones ? cones.run_id : '-',
		dark ? 'dark' : 'light'
	].join('|');

/** Prépare hors écran tout le contenu d'un slot ; `null` = rien à afficher. */
async function preparePlan({
	run,
	vt,
	layers,
	cones,
	dark
}: PlanInput): Promise<RenderPlan | null> {
	if (!run || !vt) return null;
	const runId = run.runId;
	const plan: RenderPlan = { dark };

	if (layers.mslp) {
		const g = gridFrame(run, 'mslp', vt);
		if (g) {
			const gen = isobars.scope(runId);
			const key = renderKey(runId, g.productId, vt);
			let fc = isobars.get(key);
			if (!fc) {
				fc = isobarsGeoJson(g.frame.grid);
				isobars.set(gen, key, fc);
			}
			plan.isobars = fc;
		}
	}

	if (layers.existence) {
		const g = gridFrame(run, 'existence', vt);
		if (g) {
			const gen = rasters.scope(runId);
			const key = renderKey(runId, g.productId, vt);
			let url = rasters.get(key);
			if (!url) {
				try {
					const fresh = await rasterize(g.frame);
					// Refusé (et libéré) si le run a basculé pendant la rasterisation.
					if (rasters.set(gen, key, fresh)) url = fresh;
				} catch (err) {
					console.warn('[weather-ai] raster failed', err);
				}
			}
			plan.rasterUrl = url;
			if (url) plan.rasterKey = key;
		}
	}

	const tracksProduct = Object.values(run.loaded).find((p) => p.kind === 'tracks');
	if (layers.tracks && tracksProduct?.kind === 'tracks') {
		const gen = tracksCache.scope(runId);
		const key = renderKey(runId, tracksProduct.product.productId, '*');
		let tracks = tracksCache.get(key);
		if (!tracks) {
			tracks = buildTracks(
				tracksProduct.frames.map((f) => f.product),
				runId
			);
			tracksCache.set(gen, key, tracks);
		}
		const { lines, points } = tracksToGeoJson(tracks, vt);
		plan.trackLines = lines;
		plan.trackPoints = points;
	}

	// Cônes : seulement ceux du run affiché, déjà validés (mention exacte).
	if (layers.cones && cones && cones.run_id === runId) {
		const gen = conesCache.scope(runId);
		const key = renderKey(runId, cones.product_id, '*');
		let geo = conesCache.get(key);
		if (!geo) {
			geo = conesToGeoJson(cones);
			conesCache.set(gen, key, geo);
		}
		plan.cones = geo.envelopes;
		plan.coneCentres = geo.centres;
	}

	const empty =
		!plan.rasterUrl && !plan.isobars && !plan.trackLines && !plan.cones && !plan.coneCentres;
	return empty ? null : plan;
}

// ---- Montage d'un slot -----------------------------------------------------

type Part = 'raster' | 'isobars' | 'trackLines' | 'trackPoints' | 'cones' | 'coneCentres';

interface LayerDef {
	id: string;
	part: Part;
	spec: (src: string, dark: boolean) => maplibregl.LayerSpecification;
	/** Propriétés d'opacité : à 0 au montage, valeur cible à l'affichage. */
	opacity: (dark: boolean) => Record<string, unknown>;
}

const ink = (dark: boolean) => (dark ? '#e2e8f0' : '#1e293b');
const halo = (dark: boolean) => (dark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.9)');

/** Couches d'un slot, dans l'ordre d'empilement (premier = dessous). */
const LAYER_DEFS: LayerDef[] = [
	{
		id: 'existence',
		part: 'raster',
		spec: (source) => ({
			id: '',
			type: 'raster',
			source,
			paint: { 'raster-resampling': 'linear', 'raster-fade-duration': 0 }
		}),
		opacity: () => ({ 'raster-opacity': 1 })
	},
	{
		id: 'cones90',
		part: 'cones',
		spec: (source) => ({
			id: '',
			type: 'fill',
			source,
			filter: ['==', ['get', 'level'], '0.90'],
			paint: { 'fill-color': '#f8fafc' }
		}),
		opacity: () => ({ 'fill-opacity': 0.28 })
	},
	{
		id: 'cones68',
		part: 'cones',
		spec: (source) => ({
			id: '',
			type: 'fill',
			source,
			filter: ['==', ['get', 'level'], '0.68'],
			paint: { 'fill-color': '#f8fafc' }
		}),
		opacity: () => ({ 'fill-opacity': 0.5 })
	},
	{
		id: 'conesOutline',
		part: 'cones',
		spec: (source, dark) => ({
			id: '',
			type: 'line',
			source,
			paint: { 'line-color': ink(dark), 'line-width': 0.8 }
		}),
		opacity: () => ({ 'line-opacity': 0.6 })
	},
	{
		id: 'coneCentres',
		part: 'coneCentres',
		spec: (source, dark) => ({
			id: '',
			type: 'circle',
			source,
			paint: { 'circle-radius': 3, 'circle-color': ink(dark) }
		}),
		opacity: () => ({ 'circle-opacity': 0.5 })
	},
	{
		id: 'isobars',
		part: 'isobars',
		spec: (source, dark) => ({
			id: '',
			type: 'line',
			source,
			layout: { 'line-join': 'round' },
			paint: { 'line-color': ink(dark), 'line-width': ['case', ['get', 'major'], 1.4, 0.7] }
		}),
		opacity: () => ({ 'line-opacity': 0.75 })
	},
	{
		id: 'isobarLabels',
		part: 'isobars',
		spec: (source, dark) => ({
			id: '',
			type: 'symbol',
			source,
			layout: {
				'symbol-placement': 'line',
				'symbol-spacing': 320,
				'text-field': ['to-string', ['get', 'hpa']],
				'text-font': ['Noto Sans Regular'],
				'text-size': 10
			},
			paint: { 'text-color': ink(dark), 'text-halo-color': halo(dark), 'text-halo-width': 1.2 }
		}),
		opacity: () => ({ 'text-opacity': 1 })
	},
	// Candidats de cyclogenèse : rendu distinct (pointillés, halo), jamais coloré par le vent.
	{
		id: 'candidateLines',
		part: 'trackLines',
		spec: (source) => ({
			id: '',
			type: 'line',
			source,
			filter: ['==', ['get', 'kind'], 'candidate'],
			paint: { 'line-color': '#c4b5fd', 'line-width': 1.5, 'line-dasharray': [2, 2] }
		}),
		opacity: () => ({ 'line-opacity': 1 })
	},
	{
		id: 'candidateHalos',
		part: 'trackPoints',
		spec: (source) => ({
			id: '',
			type: 'circle',
			source,
			filter: ['==', ['get', 'kind'], 'candidate'],
			paint: {
				'circle-radius': ['case', ['get', 'current'], 14, 5],
				'circle-color': '#c4b5fd',
				'circle-stroke-color': '#c4b5fd',
				'circle-stroke-width': 1.2
			}
		}),
		opacity: () => ({
			'circle-opacity': ['case', ['get', 'current'], 0.25, 0.12],
			'circle-stroke-opacity': ['case', ['get', 'current'], 0.9, 0.4]
		})
	},
	{
		id: 'declaredLines',
		part: 'trackLines',
		spec: (source, dark) => ({
			id: '',
			type: 'line',
			source,
			filter: ['==', ['get', 'kind'], 'declared'],
			layout: { 'line-join': 'round', 'line-cap': 'round' },
			paint: { 'line-color': ink(dark), 'line-width': 2 }
		}),
		opacity: () => ({ 'line-opacity': 1 })
	},
	{
		id: 'declaredPoints',
		part: 'trackPoints',
		spec: (source, dark) => ({
			id: '',
			type: 'circle',
			source,
			filter: ['==', ['get', 'kind'], 'declared'],
			paint: {
				'circle-radius': ['case', ['get', 'current'], 8, 4.5],
				'circle-color': windColorExpression() as maplibregl.ExpressionSpecification,
				'circle-stroke-color': ink(dark),
				'circle-stroke-width': ['case', ['get', 'current'], 2, 1]
			}
		}),
		opacity: () => ({ 'circle-opacity': 1, 'circle-stroke-opacity': 1 })
	},
	{
		id: 'trackLabels',
		part: 'trackPoints',
		spec: (source, dark) => ({
			id: '',
			type: 'symbol',
			source,
			filter: ['get', 'current'],
			layout: {
				'text-field': ['get', 'label'],
				'text-font': ['Noto Sans Regular'],
				'text-size': 12,
				'text-offset': [0, -1.6],
				'text-allow-overlap': true
			},
			paint: { 'text-color': ink(dark), 'text-halo-color': halo(dark), 'text-halo-width': 1.5 }
		}),
		opacity: () => ({ 'text-opacity': 1 })
	}
];

const sourceId = (slot: string, part: Part) => `weatherAi_${part}_${slot}`;
const layerId = (slot: string, def: string) => `weatherAi_${def}_${slot}`;

/** Parties présentes dans un plan, et donnée de chacune. */
function planParts(plan: RenderPlan): Partial<Record<Part, Fc | string>> {
	return {
		raster: plan.rasterUrl,
		isobars: plan.isobars,
		trackLines: plan.trackLines,
		trackPoints: plan.trackPoints,
		cones: plan.cones,
		coneCentres: plan.coneCentres
	};
}

// Parties et opacités cibles de chaque slot monté.
const mounted = new Map<string, { parts: Part[]; dark: boolean }>();

function mapAdapter(map: maplibregl.Map) {
	return {
		mount(slot: string, plan: RenderPlan) {
			const entries = Object.entries(planParts(plan)).filter(([, v]) => v !== undefined) as [
				Part,
				Fc | string
			][];
			for (const [part, data] of entries) {
				map.addSource(
					sourceId(slot, part),
					part === 'raster'
						? { type: 'image', url: data as string, coordinates: MERCATOR_IMAGE_COORDINATES }
						: { type: 'geojson', data: data as Fc }
				);
			}
			const parts = entries.map(([p]) => p);
			for (const def of LAYER_DEFS) {
				if (!parts.includes(def.part)) continue;
				const spec = def.spec(
					sourceId(slot, def.part),
					plan.dark
				) as maplibregl.LayerSpecification & {
					paint?: Record<string, unknown>;
				};
				const hidden = Object.fromEntries(Object.keys(def.opacity(plan.dark)).map((k) => [k, 0]));
				map.addLayer({
					...spec,
					id: layerId(slot, def.id),
					paint: { ...(spec.paint ?? {}), ...hidden }
				} as maplibregl.LayerSpecification);
			}
			mounted.set(slot, { parts, dark: plan.dark });
		},
		loaded(slot: string) {
			const m = mounted.get(slot);
			if (!m) return true;
			return m.parts.every((p) => {
				const id = sourceId(slot, p);
				return !map.getSource(id) || map.isSourceLoaded(id);
			});
		},
		show(slot: string) {
			const m = mounted.get(slot);
			if (!m) return;
			for (const def of LAYER_DEFS) {
				if (!m.parts.includes(def.part)) continue;
				for (const [prop, value] of Object.entries(def.opacity(m.dark))) {
					map.setPaintProperty(
						layerId(slot, def.id),
						prop as Parameters<maplibregl.Map['setPaintProperty']>[1],
						value as Parameters<maplibregl.Map['setPaintProperty']>[2]
					);
				}
			}
		},
		unmount(slot: string) {
			for (const def of LAYER_DEFS) {
				const id = layerId(slot, def.id);
				if (map.getLayer(id)) map.removeLayer(id);
			}
			for (const part of mounted.get(slot)?.parts ?? []) {
				const id = sourceId(slot, part);
				if (map.getSource(id)) map.removeSource(id);
			}
			mounted.delete(slot);
		},
		exists(slot: string) {
			const m = mounted.get(slot);
			return !!m && m.parts.some((p) => !!map.getSource(sourceId(slot, p)));
		},
		onChange(cb: () => void) {
			map.on('sourcedata', cb);
			map.on('idle', cb);
			return () => {
				map.off('sourcedata', cb);
				map.off('idle', cb);
			};
		}
	};
}

/** Message d'échec de rendu (distinct des erreurs de chargement du contrôleur). */
export const RENDER_TIMEOUT_MESSAGE =
	"Affichage Weather AI incomplet (délai dépassé) : l'état précédent est conservé, nouvel essai au prochain relevé.";

let retryTimer: ReturnType<typeof setTimeout> | undefined;

let switcherMap: maplibregl.Map | undefined;
let switcher: ReturnType<typeof createLayerSwitcher<RenderPlan>> | undefined;

/**
 * Met la carte en accord avec l'état (run, échéance, couches actives, cônes).
 * Idempotent ; sûr après un re-style. Le nouvel état n'apparaît qu'une fois
 * entièrement prêt, d'un bloc.
 */
export async function syncWeatherAiLayers(): Promise<void> {
	const map = get(mStore);
	if (!map) return;
	if (!map.isStyleLoaded()) {
		map.once('idle', () => void syncWeatherAiLayers());
		return;
	}
	if (switcherMap !== map) {
		switcherMap = map;
		mounted.clear();
		switcher = createLayerSwitcher(mapAdapter(map));
	}
	// Un re-style a purgé les slots : on oublie ceux qui n'existent plus.
	for (const slot of [...mounted.keys()]) {
		if (!mounted.get(slot)!.parts.some((p) => map.getSource(sourceId(slot, p)))) {
			mounted.delete(slot);
		}
	}

	const cones = get(weatherAiCones);
	const run = get(weatherAiRun);
	const input: PlanInput = {
		run,
		vt: get(weatherAiTime),
		layers: get(weatherAiLayers),
		cones: cones && run && cones.runId === run.runId ? cones.doc : null,
		dark: get(basemapTheme) === 'dark'
	};
	clearTimeout(retryTimer);
	retryTimer = undefined;
	let plan: RenderPlan | null = null;
	try {
		const result = await switcher!.commit(planSignature(input), async () => {
			plan = await preparePlan(input);
			return plan;
		});
		if (result === 'timeout') {
			// Slot incomplet retiré par le commutateur, état précédent conservé.
			// Le raster de ce plan est libéré (recalculé au prochain essai).
			const key = (plan as RenderPlan | null)?.rasterKey;
			if (key) rasters.delete(key);
			console.warn('[weather-ai] render timeout, previous state kept');
			weatherAiStatus.set({ state: 'error', message: RENDER_TIMEOUT_MESSAGE });
			retryTimer = setTimeout(() => void syncWeatherAiLayers(), CATALOG_POLL_MS);
		} else if (
			(result === 'shown' || result === 'cleared') &&
			get(weatherAiStatus).message === RENDER_TIMEOUT_MESSAGE
		) {
			weatherAiStatus.set({ state: 'ready' });
		}
	} catch (err) {
		console.warn('[weather-ai] render failed', err);
	}
	installTooltips(map);
}

// ---- Infobulle -------------------------------------------------------------

const esc = (s: string) =>
	s.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
	);

let tooltipMap: maplibregl.Map | undefined;
let tooltip: maplibregl.Popup | undefined;

function tooltipHtml(feature: maplibregl.MapGeoJSONFeature, coneCentres: boolean): string {
	const run = get(weatherAiRun);
	const p = feature.properties as Record<string, unknown>;
	const time = String(p.time ?? '');
	const when = `${esc(formatLead(leadHours(run?.initTime, time)))} · ${esc(formatUtc(time))}`;
	if (coneCentres) {
		return `<strong>Cône ${esc(String(p.storm).split(':').pop() ?? '')}</strong><br>${when}<br>Membres : ${p.members}/${p.memberCount}<br>Rayon 68 % : ${Math.round(Number(p.r68))} km · 90 % : ${Math.round(Number(p.r90))} km`;
	}
	if (p.kind === 'candidate') {
		return `<strong>${CANDIDATE_LABEL}</strong><br>${when}<br>Candidat de cyclogenèse détecté par le modèle, sans système réel associé. Ce n'est pas un cyclone.`;
	}
	let html = `<strong>${esc(String(p.label))}</strong><br>${when}<br>Pression centrale : ${Math.round(Number(p.mslp))} hPa<br>Vent max : ${Math.round(msToKmh(Number(p.vmax)))} km/h`;
	const cones = get(weatherAiCones);
	if (get(weatherAiLayers).cones && cones?.doc && cones.runId === run?.runId) {
		const cone = coneAt(cones.doc, String(p.id), time);
		if (cone && !cone.available)
			html += `<br>Cône indisponible : ${esc(CONE_REASON_LABELS[cone.reason])}`;
		const storm = cones.doc.storms.find((s) => s.storm_id === p.id);
		if (!cone && storm?.hemisphere === 'south') {
			html += `<br>Pas de cône au-delà de +${storm.maximum_lead_hours} h (hémisphère sud)`;
		}
	}
	return html;
}

/** Infobulle au survol des positions de trajectoire et des centres de cône du slot affiché. */
function installTooltips(map: maplibregl.Map) {
	if (tooltipMap === map) return;
	tooltipMap = map;
	tooltip = new maplibregl.Popup({
		closeButton: false,
		closeOnClick: false,
		className: 'weather-ai-tooltip'
	});
	let hovering = false;
	map.on('mousemove', (e) => {
		const slot = switcher?.activeSlot;
		const ids = slot
			? ['declaredPoints', 'candidateHalos', 'coneCentres']
					.map((d) => layerId(slot, d))
					.filter((id) => map.getLayer(id))
			: [];
		const f = ids.length ? map.queryRenderedFeatures(e.point, { layers: ids })[0] : undefined;
		if (!f) {
			if (hovering) {
				hovering = false;
				tooltip?.remove();
				map.getCanvas().style.cursor = '';
			}
			return;
		}
		hovering = true;
		map.getCanvas().style.cursor = 'pointer';
		const isCone = f.layer.id === layerId(slot!, 'coneCentres');
		tooltip!.setLngLat(e.lngLat).setHTML(tooltipHtml(f, isCone)).addTo(map);
	});
}
