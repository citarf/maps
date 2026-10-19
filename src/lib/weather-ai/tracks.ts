// Trajectoires `cyclone-tracks-product` : un document par échéance, avec un point
// par piste et par membre. Deux natures de pistes, à ne jamais confondre :
// cyclone déclaré (amorcé depuis un système réel à t0) et candidat de
// cyclogenèse (détecté par le modèle, aucun système réel associé → « zone à
// surveiller » uniquement). La nature se lit dans `model_track_id`, pas dans
// `qualification.kind` qui décrit le document entier.

export interface TrackPoint {
	member: number;
	model_track_id: string;
	valid_time: string;
	latitude: number;
	/** −180..180 (contrairement aux grilles, 0..359). */
	longitude: number;
	mslp_hpa: number;
	vmax_ms: number;
	forecast_track_point_count: number;
	forecast_track_duration_hours: number;
}

export interface TracksProduct {
	schema_version: string;
	product_id: string;
	run_id: string;
	snapshot_id: string;
	init_time: string;
	valid_time: string;
	experimental: boolean;
	qualification: { kind: string; alert_authority: boolean };
	tracks: TrackPoint[];
}

export type TrackKind = 'declared' | 'candidate' | 'unknown';

export interface Point {
	time: string;
	lat: number;
	/** Longitude déroulée : continue le long de la piste, peut sortir de ±180. */
	lon: number;
	mslpHpa: number;
	vmaxMs: number;
}

export interface Track {
	member: number;
	id: string;
	kind: TrackKind;
	label: string;
	points: Point[];
}

const DECLARED = /^(?:ecmwf-tf:\d{4}:([0-9A-Z]{2,8})|atcf:([a-z]{2}\d{6}))$/;
const CANDIDATE = /^cyclogenesis_\d+$/;

export const CANDIDATE_LABEL = 'Zone à surveiller';

export function classifyTrack(id: string): { kind: TrackKind; label: string } {
	const m = DECLARED.exec(id);
	if (m) return { kind: 'declared', label: m[1] ?? m[2] };
	if (CANDIDATE.test(id)) return { kind: 'candidate', label: CANDIDATE_LABEL };
	return { kind: 'unknown', label: id };
}

/**
 * Déroule les longitudes d'une piste : chaque point est décalé de ±360° pour
 * rester à moins de 180° du précédent. Une piste qui franchit l'antiméridien
 * reste ainsi un tracé continu (MapLibre affiche les longitudes hors ±180 sur
 * la copie voisine du monde) au lieu de traverser toute la carte.
 */
export function unwrapLongitudes(lons: number[]): number[] {
	const out: number[] = [];
	for (const lon of lons) {
		if (out.length === 0) {
			out.push(lon);
			continue;
		}
		const prev = out[out.length - 1];
		out.push(lon + 360 * Math.round((prev - lon) / 360));
	}
	return out;
}

/**
 * Regroupe les points des échéances par `(member, model_track_id)` (couple
 * unique au contrat : regrouper par identifiant seul fusionnerait les membres en
 * zigzag) et trie chaque piste par `valid_time`. Lève une erreur si un document
 * appartient à un autre run : on ne combine jamais deux runs.
 */
export function buildTracks(frames: TracksProduct[], runId: string): Track[] {
	const byKey = new Map<string, Track>();
	for (const f of frames) {
		if (f.run_id !== runId) throw new Error('Run mélangé');
		for (const t of f.tracks) {
			const key = `${t.member}:${t.model_track_id}`;
			let tr = byKey.get(key);
			if (!tr) {
				tr = {
					member: t.member,
					id: t.model_track_id,
					...classifyTrack(t.model_track_id),
					points: []
				};
				byKey.set(key, tr);
			}
			tr.points.push({
				time: t.valid_time,
				lat: t.latitude,
				lon: t.longitude,
				mslpHpa: t.mslp_hpa,
				vmaxMs: t.vmax_ms
			});
		}
	}
	const tracks = [...byKey.values()];
	for (const tr of tracks) {
		tr.points.sort((a, b) => a.time.localeCompare(b.time));
		const lons = unwrapLongitudes(tr.points.map((p) => p.lon));
		tr.points.forEach((p, k) => (p.lon = lons[k]));
	}
	return tracks.sort((a, b) => a.member - b.member || a.id.localeCompare(b.id));
}

/** Seuils de vent max (m/s) des marqueurs des cyclones déclarés, et leurs couleurs. */
export const WIND_CLASSES: { minMs: number; color: string }[] = [
	{ minMs: 0, color: '#5ebaff' },
	{ minMs: 17.5, color: '#00faf4' },
	{ minMs: 33, color: '#ffffcc' },
	{ minMs: 43, color: '#ffe775' },
	{ minMs: 50, color: '#ffc140' },
	{ minMs: 58, color: '#ff8f20' },
	{ minMs: 70, color: '#ff6060' }
];

export const msToKmh = (ms: number) => ms * 3.6;

/** Expression MapLibre de couleur selon `vmax_ms` (propriété `vmax`). */
export const windColorExpression = (): unknown[] => {
	const expr: unknown[] = ['step', ['get', 'vmax'], WIND_CLASSES[0].color];
	for (const c of WIND_CLASSES.slice(1)) expr.push(c.minMs, c.color);
	return expr;
};

/**
 * GeoJSON des pistes à afficher : une ligne par piste et un point par position.
 * Les pistes de nature inconnue sont écartées (jamais présentées comme cyclone).
 * Seule la trajectoire du membre 0 est tracée : c'est elle qui se superpose au
 * cône, et le run publié n'expose aujourd'hui que ce membre.
 */
export function tracksToGeoJson(
	tracks: Track[],
	currentTime: string | undefined
): {
	lines: GeoJSON.FeatureCollection<GeoJSON.LineString>;
	points: GeoJSON.FeatureCollection<GeoJSON.Point>;
} {
	const lines: GeoJSON.Feature<GeoJSON.LineString>[] = [];
	const points: GeoJSON.Feature<GeoJSON.Point>[] = [];
	for (const tr of tracks) {
		if (tr.kind === 'unknown' || tr.member !== 0) continue;
		if (tr.points.length >= 2) {
			lines.push({
				type: 'Feature',
				properties: { kind: tr.kind, id: tr.id, label: tr.label },
				geometry: { type: 'LineString', coordinates: tr.points.map((p) => [p.lon, p.lat]) }
			});
		}
		for (const p of tr.points) {
			points.push({
				type: 'Feature',
				properties: {
					kind: tr.kind,
					id: tr.id,
					label: tr.label,
					time: p.time,
					current: p.time === currentTime,
					mslp: p.mslpHpa,
					vmax: p.vmaxMs
				},
				geometry: { type: 'Point', coordinates: [p.lon, p.lat] }
			});
		}
	}
	return {
		lines: { type: 'FeatureCollection', features: lines },
		points: { type: 'FeatureCollection', features: points }
	};
}
