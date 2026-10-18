// Câblage MapLibre des couches Weather AI. Sources dédiées (pattern de
// `departments-layer.ts`) posées AU-DESSUS de toutes les couches : elles ne
// passent pas par le protocole `om://` ni par les SlotManager (documents JSON
// d'une autre API, run et échéances propres). Les grilles sont rasterisées dans
// un canvas (Web Mercator, nord en haut) puis servies en source `image` ; les
// isobares, trajectoires et cônes sont des sources `geojson`.
//
// `setStyle` (donc `reloadStyles()`) purge sources et couches : `syncWeatherAiLayers()`
// est rappelé après chaque re-style et à chaque changement d'état.
import { get } from 'svelte/store';

import * as maplibregl from 'maplibre-gl';

import { basemapTheme } from '$lib/stores/basemap-theme';
import { map as mStore } from '$lib/stores/map';
import {
	weatherAiCones,
	weatherAiLayers,
	weatherAiRun,
	weatherAiTime
} from '$lib/stores/weather-ai';

import { CONE_REASON_LABELS, coneAt, conesToGeoJson } from './cones';
import { MERCATOR_IMAGE_COORDINATES, renderMercatorRgba } from './grid';
import { type GridFrame, type LoadedRun, leadHours } from './loader';
import { formatLead, formatUtc, isobarsGeoJson, probabilityColor } from './render';
import {
	CANDIDATE_LABEL,
	buildTracks,
	msToKmh,
	tracksToGeoJson,
	windColorExpression
} from './tracks';

const SRC = {
	existence: 'weatherAiExistenceSource',
	isobars: 'weatherAiIsobarsSource',
	trackLines: 'weatherAiTrackLinesSource',
	trackPoints: 'weatherAiTrackPointsSource',
	cones: 'weatherAiConesSource',
	coneCentres: 'weatherAiConeCentresSource'
} as const;

const LAYER = {
	existence: 'weatherAiExistenceLayer',
	cones90: 'weatherAiCones90Layer',
	cones68: 'weatherAiCones68Layer',
	conesOutline: 'weatherAiConesOutlineLayer',
	coneCentres: 'weatherAiConeCentresLayer',
	isobars: 'weatherAiIsobarsLayer',
	isobarLabels: 'weatherAiIsobarLabelsLayer',
	candidateLines: 'weatherAiCandidateLinesLayer',
	candidateHalos: 'weatherAiCandidateHalosLayer',
	declaredLines: 'weatherAiDeclaredLinesLayer',
	declaredPoints: 'weatherAiDeclaredPointsLayer',
	trackLabels: 'weatherAiTrackLabelsLayer'
} as const;

const RASTER_W = 1024;
const RASTER_H = 1024;
const emptyFc = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] });

// Rendus coûteux mémoïsés par run (données immuables) ; purgés à la bascule.
let memoRunId: string | undefined;
const rasterUrls = new Map<string, string>();
const isobarData = new Map<string, GeoJSON.FeatureCollection>();
let tracksMemo: ReturnType<typeof buildTracks> | undefined;

function resetMemo(runId: string | undefined) {
	if (memoRunId === runId) return;
	memoRunId = runId;
	for (const url of rasterUrls.values()) URL.revokeObjectURL(url);
	rasterUrls.clear();
	isobarData.clear();
	tracksMemo = undefined;
}

const frameAt = (run: LoadedRun, kind: 'mslp' | 'existence', vt: string): GridFrame | undefined => {
	const p = Object.values(run.loaded).find((l) => l.kind === kind);
	return p && p.kind !== 'tracks' ? p.frames.find((f) => f.validTime === vt) : undefined;
};

async function existenceRasterUrl(frame: GridFrame): Promise<string> {
	const hit = rasterUrls.get(frame.validTime);
	if (hit) return hit;
	const rgba = renderMercatorRgba(frame.grid, RASTER_W, RASTER_H, probabilityColor);
	const canvas = document.createElement('canvas');
	canvas.width = RASTER_W;
	canvas.height = RASTER_H;
	canvas
		.getContext('2d')!
		.putImageData(new ImageData(new Uint8ClampedArray(rgba), RASTER_W, RASTER_H), 0, 0);
	const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
	if (!blob) throw new Error('rasterisation impossible');
	const url = URL.createObjectURL(blob);
	rasterUrls.set(frame.validTime, url);
	return url;
}

function setGeoJson(map: maplibregl.Map, id: string, data: GeoJSON.FeatureCollection) {
	const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
	if (src) src.setData(data);
	else map.addSource(id, { type: 'geojson', data });
}

function addLayer(map: maplibregl.Map, layer: maplibregl.LayerSpecification) {
	if (!map.getLayer(layer.id)) map.addLayer(layer);
}

function setVisible(map: maplibregl.Map, ids: string[], visible: boolean) {
	for (const id of ids) {
		if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
	}
}

/** Couches de la pile, dans l'ordre d'empilement (premier = dessous). */
function ensureLayers(map: maplibregl.Map) {
	const dark = get(basemapTheme) === 'dark';
	const ink = dark ? '#e2e8f0' : '#1e293b';
	const halo = dark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.9)';

	if (!map.getSource(SRC.existence)) {
		// Image transparente 1×1 en attendant la première frame.
		map.addSource(SRC.existence, {
			type: 'image',
			url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
			coordinates: MERCATOR_IMAGE_COORDINATES
		});
	}
	for (const id of [SRC.isobars, SRC.trackLines, SRC.trackPoints, SRC.cones, SRC.coneCentres]) {
		if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: emptyFc() });
	}

	addLayer(map, {
		id: LAYER.existence,
		type: 'raster',
		source: SRC.existence,
		paint: { 'raster-resampling': 'linear', 'raster-fade-duration': 0 }
	});
	addLayer(map, {
		id: LAYER.cones90,
		type: 'fill',
		source: SRC.cones,
		filter: ['==', ['get', 'level'], '0.90'],
		paint: { 'fill-color': '#f8fafc', 'fill-opacity': 0.28 }
	});
	addLayer(map, {
		id: LAYER.cones68,
		type: 'fill',
		source: SRC.cones,
		filter: ['==', ['get', 'level'], '0.68'],
		paint: { 'fill-color': '#f8fafc', 'fill-opacity': 0.5 }
	});
	addLayer(map, {
		id: LAYER.conesOutline,
		type: 'line',
		source: SRC.cones,
		paint: { 'line-color': ink, 'line-width': 0.8, 'line-opacity': 0.6 }
	});
	addLayer(map, {
		id: LAYER.coneCentres,
		type: 'circle',
		source: SRC.coneCentres,
		paint: {
			'circle-radius': 3,
			'circle-color': ink,
			'circle-opacity': 0.5
		}
	});
	addLayer(map, {
		id: LAYER.isobars,
		type: 'line',
		source: SRC.isobars,
		layout: { 'line-join': 'round' },
		paint: {
			'line-color': ink,
			'line-opacity': 0.75,
			'line-width': ['case', ['get', 'major'], 1.4, 0.7]
		}
	});
	addLayer(map, {
		id: LAYER.isobarLabels,
		type: 'symbol',
		source: SRC.isobars,
		layout: {
			'symbol-placement': 'line',
			'symbol-spacing': 320,
			'text-field': ['to-string', ['get', 'hpa']],
			'text-font': ['Noto Sans Regular'],
			'text-size': 10
		},
		paint: { 'text-color': ink, 'text-halo-color': halo, 'text-halo-width': 1.2 }
	});
	// Candidats de cyclogenèse : rendu distinct (pointillés, halo), jamais coloré par le vent.
	addLayer(map, {
		id: LAYER.candidateLines,
		type: 'line',
		source: SRC.trackLines,
		filter: ['==', ['get', 'kind'], 'candidate'],
		paint: { 'line-color': '#c4b5fd', 'line-width': 1.5, 'line-dasharray': [2, 2] }
	});
	addLayer(map, {
		id: LAYER.candidateHalos,
		type: 'circle',
		source: SRC.trackPoints,
		filter: ['==', ['get', 'kind'], 'candidate'],
		paint: {
			'circle-radius': ['case', ['get', 'current'], 14, 5],
			'circle-color': '#c4b5fd',
			'circle-opacity': ['case', ['get', 'current'], 0.25, 0.12],
			'circle-stroke-color': '#c4b5fd',
			'circle-stroke-width': 1.2,
			'circle-stroke-opacity': ['case', ['get', 'current'], 0.9, 0.4]
		}
	});
	addLayer(map, {
		id: LAYER.declaredLines,
		type: 'line',
		source: SRC.trackLines,
		filter: ['==', ['get', 'kind'], 'declared'],
		layout: { 'line-join': 'round', 'line-cap': 'round' },
		paint: { 'line-color': ink, 'line-width': 2 }
	});
	addLayer(map, {
		id: LAYER.declaredPoints,
		type: 'circle',
		source: SRC.trackPoints,
		filter: ['==', ['get', 'kind'], 'declared'],
		paint: {
			'circle-radius': ['case', ['get', 'current'], 8, 4.5],
			'circle-color': windColorExpression() as maplibregl.ExpressionSpecification,
			'circle-stroke-color': ink,
			'circle-stroke-width': ['case', ['get', 'current'], 2, 1]
		}
	});
	addLayer(map, {
		id: LAYER.trackLabels,
		type: 'symbol',
		source: SRC.trackPoints,
		filter: ['get', 'current'],
		layout: {
			'text-field': ['get', 'label'],
			'text-font': ['Noto Sans Regular'],
			'text-size': 12,
			'text-offset': [0, -1.6],
			'text-allow-overlap': true
		},
		paint: { 'text-color': ink, 'text-halo-color': halo, 'text-halo-width': 1.5 }
	});
}

let syncSeq = 0;

/**
 * Met la carte en accord avec l'état (run, échéance, couches actives, cônes).
 * Idempotent ; sûr après un re-style. Rien n'est ajouté tant qu'aucune couche
 * n'est active.
 */
export async function syncWeatherAiLayers(): Promise<void> {
	const map = get(mStore);
	if (!map) return;
	if (!map.isStyleLoaded()) {
		map.once('idle', () => void syncWeatherAiLayers());
		return;
	}
	const seq = ++syncSeq;
	const layers = get(weatherAiLayers);
	const run = get(weatherAiRun);
	const vt = get(weatherAiTime);
	const cones = get(weatherAiCones);
	const anyOn = Object.values(layers).some(Boolean);
	if (!anyOn && !map.getSource(SRC.isobars)) return;

	ensureLayers(map);
	resetMemo(run?.runId);

	// Pression : isobares de la frame affichée.
	const mslp = run && vt ? frameAt(run, 'mslp', vt) : undefined;
	if (layers.mslp && mslp) {
		let data = isobarData.get(vt!);
		if (!data) {
			data = isobarsGeoJson(mslp.grid);
			isobarData.set(vt!, data);
		}
		setGeoJson(map, SRC.isobars, data);
	}
	setVisible(map, [LAYER.isobars, LAYER.isobarLabels], layers.mslp && !!mslp);

	// Probabilité d'existence : raster de la frame affichée.
	const existence = run && vt ? frameAt(run, 'existence', vt) : undefined;
	if (layers.existence && existence) {
		try {
			const url = await existenceRasterUrl(existence);
			if (seq !== syncSeq) return;
			(map.getSource(SRC.existence) as maplibregl.ImageSource | undefined)?.updateImage({
				url,
				coordinates: MERCATOR_IMAGE_COORDINATES
			});
		} catch (err) {
			console.warn('[weather-ai] raster failed', err);
		}
	}
	setVisible(map, [LAYER.existence], layers.existence && !!existence);

	// Trajectoires : pistes complètes du run, position courante mise en avant.
	const tracksProduct = run && Object.values(run.loaded).find((p) => p.kind === 'tracks');
	if (layers.tracks && run && tracksProduct?.kind === 'tracks') {
		tracksMemo ??= buildTracks(
			tracksProduct.frames.map((f) => f.product),
			run.runId
		);
		const { lines, points } = tracksToGeoJson(tracksMemo, vt);
		setGeoJson(map, SRC.trackLines, lines);
		setGeoJson(map, SRC.trackPoints, points);
	}
	setVisible(
		map,
		[
			LAYER.candidateLines,
			LAYER.candidateHalos,
			LAYER.declaredLines,
			LAYER.declaredPoints,
			LAYER.trackLabels
		],
		layers.tracks && !!tracksProduct
	);

	// Cônes : seulement ceux du run affiché, validés (mention exacte).
	const conesDoc = cones && run && cones.runId === run.runId ? cones.doc : null;
	if (layers.cones && conesDoc) {
		const { envelopes, centres } = conesToGeoJson(conesDoc);
		setGeoJson(map, SRC.cones, envelopes);
		setGeoJson(map, SRC.coneCentres, centres);
	}
	setVisible(
		map,
		[LAYER.cones90, LAYER.cones68, LAYER.conesOutline, LAYER.coneCentres],
		layers.cones && !!conesDoc
	);

	installTooltips(map);
}

const esc = (s: string) =>
	s.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
	);

let tooltipMap: maplibregl.Map | undefined;
let tooltip: maplibregl.Popup | undefined;

function tooltipHtml(feature: maplibregl.MapGeoJSONFeature): string {
	const run = get(weatherAiRun);
	const p = feature.properties as Record<string, unknown>;
	const time = String(p.time ?? '');
	const when = `${esc(formatLead(leadHours(run?.initTime, time)))} · ${esc(formatUtc(time))}`;
	if (feature.layer.id === LAYER.coneCentres) {
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

/** Infobulle au survol des positions de trajectoire et des centres de cône (une fois par carte). */
function installTooltips(map: maplibregl.Map) {
	if (tooltipMap === map) return;
	tooltipMap = map;
	tooltip = new maplibregl.Popup({
		closeButton: false,
		closeOnClick: false,
		className: 'weather-ai-tooltip'
	});
	const hoverable = [LAYER.declaredPoints, LAYER.candidateHalos, LAYER.coneCentres];
	let hovering = false;
	map.on('mousemove', (e) => {
		const ids = hoverable.filter((id) => map.getLayer(id));
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
		tooltip!.setLngLat(e.lngLat).setHTML(tooltipHtml(f)).addTo(map);
	});
}
