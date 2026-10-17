/**
 * Logique pure de l'infobulle de valeur (`popup.ts`), portée d'open-meteo/maps
 * (#373 flèche de direction, #361 lignes des superpositions) : libellés courts
 * des superpositions et rampes de la flèche (longueur, opacité, épaisseur selon
 * la vitesse, reprises du style des flèches de la carte).
 */
import { LEVEL_PREFIX, LEVEL_UNIT_REGEX, variableOptions } from '@openmeteo/weather-map-layer';

import { translateVariableLabel } from '$lib/i18n/variables-fr';

import type { ArrowStyle } from '$lib/vector-styles';

/**
 * Raccourcit un libellé long en gardant son niveau :
 * « Hauteur géopotentielle (500 hPa) » → « Hauteur… (500 hPa) ».
 */
export const truncateLabel = (label: string, max = 20): string => {
	if (label.length <= max) return label;
	const suffix = label.match(/\s*\(\d+\s*(?:m|cm|hPa)\)$/)?.[0] ?? '';
	const base = suffix ? label.slice(0, label.length - suffix.length) : label;
	const room = Math.max(max - suffix.length - 1, 4);
	if (base.length <= room + 1) return label;
	return base.slice(0, room).trimEnd() + '…' + suffix;
};

/**
 * Noms très courts des lignes de superposition, indexés par préfixe de groupe
 * de niveaux (ou par identifiant complet pour une variable sans niveau).
 */
const SHORT_LABELS: Record<string, string> = {
	cape: 'CAPE',
	cloud_cover: 'Nuages',
	cloud_cover_low: 'Nuages bas',
	cloud_cover_mid: 'Nuages moy.',
	cloud_cover_high: 'Nuages hauts',
	freezing_level_height: 'Iso 0',
	geopotential_height: 'Z',
	precipitation: 'Précip',
	precipitation_probability: 'Prob',
	pressure_msl: 'Pmer',
	relative_humidity: 'HR',
	snowfall: 'Neige',
	temperature: 'T',
	theta_e: 'θe',
	theta_w: "θ'w",
	thickness_500_1000hPa: 'Épaisseur',
	total_column_integrated_water_vapour: 'Eau préc.',
	vertical_velocity: 'VV',
	wave_height: 'Vagues',
	wind: 'Vent',
	wind_gusts_10m: 'Rafales'
};

/**
 * Libellé compact d'une ligne de superposition : abréviation pour les variables
 * connues (« Nuages », « Précip »), numéro de niveau conservé pour les niveaux de
 * pression (« T 850 », « Z 500 »), libellé traduit tronqué sinon.
 */
export const shortLabel = (variable: string): string => {
	if (SHORT_LABELS[variable]) return SHORT_LABELS[variable];
	const level = variable.match(LEVEL_UNIT_REGEX)?.groups;
	const base = level
		? (variable.match(LEVEL_PREFIX)?.groups?.prefix ?? variable.replace(/_\d+(?:hPa|m)$/, ''))
		: variable;
	const short = SHORT_LABELS[base];
	if (!short) {
		const label = variableOptions.find((option) => option.value === variable)?.label ?? variable;
		return truncateLabel(translateVariableLabel(label), 14);
	}
	return level?.unit === 'hPa' ? `${short} ${level.level}` : short;
};

/** Pression et géopotentiel : lignes de contexte, plus discrètes. */
export const isPressureOrHeight = (variable: string): boolean =>
	variable === 'pressure_msl' || variable.startsWith('geopotential_height');

// ── Flèche de direction ─────────────────────────────────────────────────────

/** Boîte à l'écran, en px. Les épaisseurs de trait sont converties dans ces unités. */
export const ARROW_PX = 18;
/** Unités du viewBox par boîte (`size` de la géométrie des flèches de la carte). */
export const ARROW_UNITS = 100;
/** Demi-largeur et profondeur de la pointe, en fractions de `size`. */
export const HEAD_HALF = 13;
export const HEAD_DEPTH = 22;

/** Longueur de la hampe (fraction de la boîte) selon la vitesse, comme la carte. */
export const ARROW_LENGTH_ANCHORS: [speed: number, length: number][] = [
	[0, 0.5],
	[1, 0.55],
	[2, 0.6],
	[3, 0.7],
	[5, 0.75],
	[10, 0.8],
	[20, 0.85]
];

/**
 * Opacité de la flèche : la rampe alpha de la carte descend à 0,2, invisible sur
 * un glyphe aussi petit à côté d'un texte gras ; sa forme est gardée mais
 * ramenée dans une plage lisible.
 */
export const ARROW_OPACITY_RANGE: [min: number, max: number] = [0.4, 1];

/** Épaisseur en px, ramenée elle aussi : 1,5–2,8 px sur la carte, trop lourd ici. */
export const ARROW_WIDTH_RANGE: [min: number, max: number] = [1.1, 2];

/** Alpha d'une couleur `rgb()`/`rgba()` ; 1 sans canal alpha. */
export const alphaOf = (color: string): number => {
	const parts = color.slice(color.indexOf('(') + 1, color.lastIndexOf(')')).split(',');
	return parts.length > 3 ? Number(parts[3]) : 1;
};

/** Opacité et épaisseur par vitesse, tirées du style des flèches de la carte. */
export const arrowStyleAnchors = (
	style: ArrowStyle,
	dark: boolean
): [speed: number, alpha: number, width: number][] =>
	[...style.levels]
		.sort((a, b) => a.minSpeed - b.minSpeed)
		.map((level) => [
			level.minSpeed,
			alphaOf(dark ? level.darkColor : level.lightColor),
			level.width
		]);

/** Lecture linéaire par morceaux d'une table d'ancres, bornée hors plage. */
export const rampAt = (anchors: number[][], speed: number, column: number): number => {
	const first = anchors[0];
	if (speed <= first[0]) return first[column];
	for (let i = 1; i < anchors.length; i++) {
		const [x1] = anchors[i];
		if (speed > x1) continue;
		const [x0] = anchors[i - 1];
		const t = x1 === x0 ? 1 : (speed - x0) / (x1 - x0);
		return anchors[i - 1][column] + t * (anchors[i][column] - anchors[i - 1][column]);
	}
	return anchors[anchors.length - 1][column];
};

/**
 * Lit la rampe de la carte à `speed` et la ramène dans `range` : la flèche garde
 * la progression des valeurs faibles aux fortes, à sa propre intensité.
 */
export const rescaledRamp = (
	anchors: number[][],
	speed: number,
	column: number,
	[min, max]: [number, number]
): number => {
	const values = anchors.map((anchor) => anchor[column]);
	const weakest = Math.min(...values);
	const strongest = Math.max(...values);
	const t =
		strongest === weakest ? 1 : (rampAt(anchors, speed, column) - weakest) / (strongest - weakest);
	return min + t * (max - min);
};

/**
 * Angle continu (non replié) le plus proche de `target` depuis `current` :
 * l'interpolation vers la valeur brute ferait le grand tour à chaque passage
 * de 0/360.
 */
export const unwrapAngle = (current: number, target: number): number =>
	current + ((((target - current) % 360) + 540) % 360) - 180;
