/**
 * Helpers purs du modèle de graphique : (dé)sérialisation URL des sources et
 * comparaison de graphiques.
 *
 * Grammaire URL du paramètre `sources` (séparé par des virgules, un jeton par
 * source) : `variable[:drapeaux]` où les drapeaux sont une concaténation de `r`
 * (raster), `a` (flèches), `c` éventuellement suivi de l'intervalle des
 * isolignes, `i` (vecteurs en ligne), `o` suivi de l'opacité et `w` suivi de
 * l'épaisseur des isolignes. Un jeton sans drapeaux signifie raster seul.
 * Exemple : `temperature_850hPa:rc2,geopotential_height_500hPa:c4w0.8`
 */
import type { ChartSource } from '$lib/chart-types';

const serializeSource = (source: ChartSource): string => {
	let flags = '';
	if (source.raster) flags += 'r';
	if (source.arrows) flags += 'a';
	if (source.inlineVectors) flags += 'i';
	if (source.contours) flags += 'c' + (source.contourInterval ?? '');
	if (source.opacity !== undefined) flags += 'o' + source.opacity;
	if (source.lineWidth !== undefined) flags += 'w' + source.lineWidth;
	// Une source raster seule correspond au défaut sans drapeaux : URL plus courte
	if (flags === 'r') return source.variable;
	return `${source.variable}:${flags}`;
};

export const serializeSources = (sources: ChartSource[]): string =>
	sources.map(serializeSource).join(',');

const SOURCE_TOKEN_REGEX = /^(?<variable>[a-z0-9_]+)(?::(?<flags>[a-z0-9.]*))?$/i;
const NUMBER = '[0-9]+(?:\\.[0-9]+)?';
const FLAGS_REGEX = new RegExp(`^(?:r|a|i|c(?:${NUMBER})?|o${NUMBER}|w${NUMBER})*$`);

const parseSourceToken = (token: string): ChartSource | undefined => {
	const match = token.match(SOURCE_TOKEN_REGEX);
	if (!match?.groups) return undefined;

	const source: ChartSource = { variable: match.groups.variable };
	const flags = match.groups.flags;
	if (flags === undefined) {
		source.raster = true;
		return source;
	}
	if (!FLAGS_REGEX.test(flags)) return undefined;

	if (flags.includes('r')) source.raster = true;
	if (flags.includes('a')) source.arrows = true;
	if (flags.includes('i')) source.inlineVectors = true;
	const contourMatch = flags.match(/c(?<interval>[0-9]+(?:\.[0-9]+)?)?/);
	if (contourMatch) {
		source.contours = true;
		if (contourMatch.groups?.interval) {
			source.contourInterval = Number(contourMatch.groups.interval);
		}
	}
	const opacity = flags.match(/o(?<value>[0-9]+(?:\.[0-9]+)?)/)?.groups?.value;
	if (opacity) source.opacity = Number(opacity);
	const lineWidth = flags.match(/w(?<value>[0-9]+(?:\.[0-9]+)?)/)?.groups?.value;
	if (lineWidth) source.lineWidth = Number(lineWidth);
	return source;
};

/**
 * Analyse un paramètre d'URL `sources`. Renvoie undefined si un jeton est
 * mal formé ou s'il n'y a aucune source. Les variables en double sont fusionnées.
 */
export const parseSources = (raw: string): ChartSource[] | undefined => {
	const byVariable = new Map<string, ChartSource>();
	for (const token of raw.split(',')) {
		const source = parseSourceToken(token.trim());
		if (!source) return undefined;

		const existing = byVariable.get(source.variable);
		if (existing) {
			existing.raster ||= source.raster;
			existing.arrows ||= source.arrows;
			existing.inlineVectors ||= source.inlineVectors;
			existing.contours ||= source.contours;
			existing.contourInterval ??= source.contourInterval;
			existing.opacity ??= source.opacity;
			existing.lineWidth ??= source.lineWidth;
		} else {
			byVariable.set(source.variable, source);
		}
	}

	const sources = [...byVariable.values()];
	if (!sources.length) return undefined;
	// Les sources qui ne dessinent rien sont autorisées : un graphique peut
	// contenir une variable dont tous les types de couches sont désactivés, et
	// `variable:` la restitue à l'identique
	return sources;
};

const sourceEquals = (a: ChartSource, b: ChartSource): boolean =>
	a.variable === b.variable &&
	!a.raster === !b.raster &&
	!a.contours === !b.contours &&
	!a.arrows === !b.arrows &&
	(a.contours ? a.contourInterval === b.contourInterval : true) &&
	a.opacity === b.opacity &&
	a.lineWidth === b.lineWidth &&
	!a.inlineVectors === !b.inlineVectors;

export const sourcesEqual = (a: ChartSource[], b: ChartSource[]): boolean =>
	a.length === b.length && a.every((source, i) => sourceEquals(source, b[i]));

export const cloneSources = (sources: ChartSource[]): ChartSource[] =>
	sources.map((source) => ({ ...source }));
