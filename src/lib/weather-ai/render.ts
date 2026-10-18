// Rendus purs des couches Weather AI (testables sans carte) : palette de
// probabilité, isobares GeoJSON, libellés d'échéance.
import { type NormalizedGrid, type Rgba, isolineLevels, isolines } from './grid';

/** Seuil sous lequel la probabilité reste transparente (ne pas voiler la carte). */
export const PROBABILITY_FLOOR = 0.05;

/** Palette séquentielle 0 → 1 (paliers interpolés), transparente sous le seuil. */
export const PROBABILITY_STOPS: { value: number; color: Rgba }[] = [
	{ value: 0.05, color: [255, 245, 160, 90] },
	{ value: 0.2, color: [254, 204, 92, 150] },
	{ value: 0.4, color: [253, 141, 60, 185] },
	{ value: 0.6, color: [240, 59, 32, 205] },
	{ value: 0.8, color: [189, 0, 38, 220] },
	{ value: 1, color: [122, 1, 119, 230] }
];

export function probabilityColor(p: number): Rgba | null {
	if (!(p >= PROBABILITY_FLOOR)) return null;
	const stops = PROBABILITY_STOPS;
	if (p >= stops[stops.length - 1].value) return stops[stops.length - 1].color;
	for (let k = 1; k < stops.length; k++) {
		const hi = stops[k];
		if (p > hi.value) continue;
		const lo = stops[k - 1];
		const t = (p - lo.value) / (hi.value - lo.value);
		return lo.color.map((c, n) => Math.round(c + (hi.color[n] - c) * t)) as Rgba;
	}
	return stops[0].color;
}

export const ISOBAR_STEP_HPA = 4;

/** Isobares tous les `step` hPa ; `major` marque les multiples de 20 hPa (trait renforcé). */
export function isobarsGeoJson(
	g: NormalizedGrid,
	step = ISOBAR_STEP_HPA
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
	const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
	for (const level of isolineLevels(g, step)) {
		for (const line of isolines(g, level)) {
			features.push({
				type: 'Feature',
				properties: { hpa: level, major: level % 20 === 0 },
				geometry: { type: 'LineString', coordinates: line }
			});
		}
	}
	return { type: 'FeatureCollection', features };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** « 19/10 18:00 UTC » — toujours explicitement en UTC. */
export function formatUtc(iso: string): string {
	const d = new Date(iso);
	return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** « +18 h », ou chaîne vide sans `init_time`. */
export const formatLead = (lead: number | undefined): string =>
	lead === undefined ? '' : `${lead >= 0 ? '+' : ''}${lead} h`;
