// Grilles `carto-grid-product` (pression, probabilité d'existence cyclonique).
//
// La géométrie se lit dans `grid`, jamais dans le nom du produit. Pièges du
// contrat : longitudes 0..359 (on remet les colonnes en −180..180, repère des
// trajectoires et de MapLibre), première ligne au pôle Sud (on garde des lignes
// sud → nord et c'est le rendu raster qui retourne l'axe vertical).

export interface GridGeometry {
	latitude_start: number;
	latitude_step: number;
	latitude_count: number;
	longitude_start: number;
	longitude_step: number;
	longitude_count: number;
	order: string;
}

export interface GridProduct {
	schema_version: string;
	product_id: string;
	run_id: string;
	snapshot_id: string;
	valid_time: string;
	experimental: boolean;
	grid: GridGeometry;
	variable: { name: string; unit: string; values: number[] };
}

/**
 * Grille normalisée : lignes sud → nord, colonnes ouest → est avec des
 * longitudes croissantes dans [−180, 180[. `values` est en ligne-majeure.
 */
export interface NormalizedGrid {
	lats: Float64Array;
	lons: Float64Array;
	values: Float32Array;
	/** La grille fait le tour du globe : la dernière colonne se raccorde à la première. */
	periodic: boolean;
	unit: string;
}

const EPS = 1e-6;

/** Ramène une longitude dans [−180, 180[. */
export const wrapLongitude = (lon: number): number => {
	const l = (((lon + 180) % 360) + 360) % 360;
	return l - 180;
};

/**
 * Valide la géométrie déclarée et le nombre de valeurs, puis réordonne lignes et
 * colonnes. Lève une erreur sur une grille incompatible : le run est alors refusé.
 */
export function normalizeGrid(product: GridProduct): NormalizedGrid {
	const { grid, variable } = product;
	const nLat = grid?.latitude_count;
	const nLon = grid?.longitude_count;
	if (grid?.order !== 'latitude-major') throw new Error('Grille incompatible : ordre');
	if (!Number.isInteger(nLat) || !Number.isInteger(nLon) || nLat < 2 || nLon < 2) {
		throw new Error('Grille incompatible : dimensions');
	}
	if (!(grid.latitude_step !== 0 && grid.longitude_step > 0)) {
		throw new Error('Grille incompatible : pas');
	}
	if (!Array.isArray(variable?.values) || variable.values.length !== nLat * nLon) {
		throw new Error('Grille incompatible : nombre de valeurs');
	}

	// Lignes sud → nord, quel que soit le signe du pas déclaré.
	const rowOrder = Array.from({ length: nLat }, (_, i) => i);
	if (grid.latitude_step < 0) rowOrder.reverse();
	// Colonnes triées par longitude ramenée en −180..180.
	const colOrder = Array.from({ length: nLon }, (_, j) => j).sort(
		(a, b) =>
			wrapLongitude(grid.longitude_start + a * grid.longitude_step) -
			wrapLongitude(grid.longitude_start + b * grid.longitude_step)
	);

	const lats = new Float64Array(nLat);
	rowOrder.forEach((src, i) => (lats[i] = grid.latitude_start + src * grid.latitude_step));
	const lons = new Float64Array(nLon);
	colOrder.forEach(
		(src, j) => (lons[j] = wrapLongitude(grid.longitude_start + src * grid.longitude_step))
	);

	const values = new Float32Array(nLat * nLon);
	for (let i = 0; i < nLat; i++) {
		const srcRow = rowOrder[i] * nLon;
		for (let j = 0; j < nLon; j++) {
			const v = variable.values[srcRow + colOrder[j]];
			values[i * nLon + j] = typeof v === 'number' && Number.isFinite(v) ? v : NaN;
		}
	}

	const periodic = Math.abs(nLon * grid.longitude_step - 360) < EPS;
	return { lats, lons, values, periodic, unit: variable.unit };
}

/** Applique une transformation d'unité (ex. Pa → hPa) sans toucher à la géométrie. */
export const mapValues = (g: NormalizedGrid, f: (v: number) => number): NormalizedGrid => ({
	...g,
	values: g.values.map(f)
});

/**
 * Valeur bilinéaire au point (lat, lon). Les longitudes bouclent à
 * l'antiméridien sur une grille globale ; NaN hors grille.
 */
export function sampleGrid(g: NormalizedGrid, lat: number, lon: number): number {
	const nLat = g.lats.length;
	const nLon = g.lons.length;
	const latStep = g.lats[1] - g.lats[0];
	const lonStep = g.lons[1] - g.lons[0];

	const fi = (lat - g.lats[0]) / latStep;
	if (fi < -EPS || fi > nLat - 1 + EPS) return NaN;
	const i0 = Math.min(Math.max(Math.floor(fi), 0), nLat - 2);
	const ti = Math.min(Math.max(fi - i0, 0), 1);

	let fj = (wrapLongitude(lon) - g.lons[0]) / lonStep;
	let j0: number;
	let j1: number;
	if (g.periodic) {
		fj = ((fj % nLon) + nLon) % nLon;
		j0 = Math.floor(fj);
		j1 = (j0 + 1) % nLon;
	} else {
		if (fj < -EPS || fj > nLon - 1 + EPS) return NaN;
		j0 = Math.min(Math.max(Math.floor(fj), 0), nLon - 2);
		j1 = j0 + 1;
	}
	const tj = Math.min(Math.max(fj - j0, 0), 1);

	const v = g.values;
	const a = v[i0 * nLon + j0];
	const b = v[i0 * nLon + j1];
	const c = v[(i0 + 1) * nLon + j0];
	const d = v[(i0 + 1) * nLon + j1];
	return (a * (1 - tj) + b * tj) * (1 - ti) + (c * (1 - tj) + d * tj) * ti;
}

/** Latitude limite de Web Mercator : l'image raster couvre [−MAX, MAX]. */
export const MERCATOR_MAX_LAT = 85.0511287798066;

/** Coins d'une source `image` MapLibre couvrant le monde Mercator (haut-gauche d'abord). */
export const MERCATOR_IMAGE_COORDINATES: [
	[number, number],
	[number, number],
	[number, number],
	[number, number]
] = [
	[-180, MERCATOR_MAX_LAT],
	[180, MERCATOR_MAX_LAT],
	[180, -MERCATOR_MAX_LAT],
	[-180, -MERCATOR_MAX_LAT]
];

/** Latitude de la ligne de pixels `y` (centre) d'une image Mercator de hauteur `h`, nord en haut. */
export const mercatorRowLatitude = (y: number, h: number): number => {
	const yMax = Math.log(Math.tan(Math.PI / 4 + (MERCATOR_MAX_LAT * Math.PI) / 360));
	const merc = yMax - (2 * yMax * (y + 0.5)) / h;
	return (Math.atan(Math.sinh(merc)) * 180) / Math.PI;
};

export type Rgba = [number, number, number, number];

/**
 * Rasterise la grille en RGBA dans la projection de la carte (Web Mercator,
 * nord en haut : l'axe vertical de la grille sud → nord est donc retourné ici).
 * MapLibre interpole linéairement une source `image` dans l'espace Mercator :
 * rééchantillonner par ligne de latitude Mercator évite le décalage nord-sud
 * qu'aurait une image équirectangulaire.
 */
export function renderMercatorRgba(
	g: NormalizedGrid,
	width: number,
	height: number,
	color: (v: number) => Rgba | null
): Uint8ClampedArray {
	const out = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) {
		const lat = mercatorRowLatitude(y, height);
		for (let x = 0; x < width; x++) {
			const lon = -180 + ((x + 0.5) * 360) / width;
			const v = sampleGrid(g, lat, lon);
			if (!Number.isFinite(v)) continue;
			const c = color(v);
			if (!c) continue;
			const k = (y * width + x) * 4;
			out[k] = c[0];
			out[k + 1] = c[1];
			out[k + 2] = c[2];
			out[k + 3] = c[3];
		}
	}
	return out;
}

/** Niveaux d'isolignes multiples de `step` couvrant [min, max]. */
export function isolineLevels(g: NormalizedGrid, step: number): number[] {
	let min = Infinity;
	let max = -Infinity;
	for (const v of g.values) {
		if (!Number.isFinite(v)) continue;
		if (v < min) min = v;
		if (v > max) max = v;
	}
	if (!Number.isFinite(min)) return [];
	const levels: number[] = [];
	for (let l = Math.ceil(min / step) * step; l <= max; l += step) levels.push(l);
	return levels;
}

type Pt = [number, number];

/**
 * Isolignes par marching squares, segments raccordés en polylignes. Sur une
 * grille globale, une colonne de raccord (la première, décalée de +360°) ferme
 * l'anneau : une isobare qui franchit l'antiméridien reste continue au lieu
 * d'être coupée à la dernière colonne. Les coordonnées sortent en [lon, lat].
 */
export function isolines(g: NormalizedGrid, level: number): Pt[][] {
	const nLat = g.lats.length;
	const nLonData = g.lons.length;
	const nLon = g.periodic ? nLonData + 1 : nLonData;
	const lonAt = (j: number) => (j < nLonData ? g.lons[j] : g.lons[0] + 360);
	const valAt = (i: number, j: number) => g.values[i * nLonData + (j % nLonData)];

	// Point de franchissement d'une arête, identifié par une clé unique.
	const points = new Map<string, Pt>();
	const crossing = (key: string, i0: number, j0: number, i1: number, j1: number): string => {
		if (!points.has(key)) {
			const a = valAt(i0, j0);
			const b = valAt(i1, j1);
			const t = a === b ? 0.5 : (level - a) / (b - a);
			points.set(key, [
				lonAt(j0) + (lonAt(j1) - lonAt(j0)) * t,
				g.lats[i0] + (g.lats[i1] - g.lats[i0]) * t
			]);
		}
		return key;
	};

	const adjacency = new Map<string, string[]>();
	const link = (a: string, b: string) => {
		(adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b);
		(adjacency.get(b) ?? adjacency.set(b, []).get(b)!).push(a);
	};

	for (let i = 0; i < nLat - 1; i++) {
		for (let j = 0; j < nLon - 1; j++) {
			const bl = valAt(i, j);
			const br = valAt(i, j + 1);
			const tr = valAt(i + 1, j + 1);
			const tl = valAt(i + 1, j);
			if (![bl, br, tr, tl].every(Number.isFinite)) continue;
			const c =
				(bl >= level ? 1 : 0) |
				(br >= level ? 2 : 0) |
				(tr >= level ? 4 : 0) |
				(tl >= level ? 8 : 0);
			if (c === 0 || c === 15) continue;

			// Arêtes : bas (i, j→j+1), droite (j+1, i→i+1), haut (i+1), gauche (j).
			const B = () => crossing(`h${i}:${j}`, i, j, i, j + 1);
			const R = () => crossing(`v${i}:${j + 1}`, i, j + 1, i + 1, j + 1);
			const T = () => crossing(`h${i + 1}:${j}`, i + 1, j, i + 1, j + 1);
			const L = () => crossing(`v${i}:${j}`, i, j, i + 1, j);
			const centreAbove = (bl + br + tr + tl) / 4 >= level;

			switch (c) {
				case 1:
				case 14:
					link(L(), B());
					break;
				case 2:
				case 13:
					link(B(), R());
					break;
				case 3:
				case 12:
					link(L(), R());
					break;
				case 4:
				case 11:
					link(R(), T());
					break;
				case 6:
				case 9:
					link(B(), T());
					break;
				case 7:
				case 8:
					link(L(), T());
					break;
				case 5: // bl et tr au-dessus : col, levé par la valeur au centre
					if (centreAbove) {
						link(L(), T());
						link(B(), R());
					} else {
						link(L(), B());
						link(R(), T());
					}
					break;
				case 10: // br et tl au-dessus
					if (centreAbove) {
						link(L(), B());
						link(R(), T());
					} else {
						link(L(), T());
						link(B(), R());
					}
					break;
			}
		}
	}

	// Raccord des segments : on part d'abord des extrémités libres (lignes
	// ouvertes), puis des anneaux restants.
	const visited = new Set<string>();
	const lines: Pt[][] = [];
	const walk = (start: string) => {
		const keys = [start];
		visited.add(start);
		let cur = start;
		for (;;) {
			const next = (adjacency.get(cur) ?? []).find((k) => !visited.has(k));
			if (!next) break;
			visited.add(next);
			keys.push(next);
			cur = next;
		}
		// Anneau fermé : on répète le premier point.
		if (keys.length > 2 && (adjacency.get(cur) ?? []).includes(start)) keys.push(start);
		if (keys.length >= 2) lines.push(keys.map((k) => points.get(k)!));
	};
	for (const [k, n] of adjacency) if (n.length === 1 && !visited.has(k)) walk(k);
	for (const k of adjacency.keys()) if (!visited.has(k)) walk(k);
	return lines;
}
