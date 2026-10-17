/**
 * Modèle « fond + superpositions » d'une composition de cartes : un aplat
 * (le fond, piloté par le pipeline principal) et une liste de sources
 * superposées (isolignes, flèches). Logique pure, sans dépendance au DOM.
 */
import { variableAvailable, variableHasDirections } from '@openmeteo/weather-map-layer';

import { cloneSources, sourcesEqual } from '$lib/chart-encoding';
import { chartPresets } from '$lib/chart-presets';

import type { ChartPreset, ChartSource } from '$lib/chart-types';

export interface Composition {
	/** Variable du fond (aplat). */
	variable: string;
	/** Sources superposées au fond, dans l'ordre d'empilement. */
	overlays: ChartSource[];
}

export interface SavedComposition {
	id: string;
	name: string;
	composition: Composition;
	createdAt: number;
}

/**
 * Sépare une liste de sources en fond + superpositions. Le fond est la
 * première source avec aplat (à défaut la première source) ; ses isolignes
 * et flèches deviennent une superposition sans aplat, en tête de liste.
 */
export const splitChartSources = (sources: ChartSource[]): Composition => {
	const copies = cloneSources(sources);
	const index = Math.max(
		0,
		copies.findIndex((s) => s.raster)
	);
	const [background] = copies.splice(index, 1);
	const overlays = copies;

	if (background.contours || background.arrows) {
		const own: ChartSource = { variable: background.variable };
		if (background.contours) own.contours = true;
		if (background.contourInterval !== undefined) own.contourInterval = background.contourInterval;
		if (background.arrows) own.arrows = true;
		overlays.unshift(own);
	}

	return { variable: background.variable, overlays };
};

export const compositionsEqual = (a: Composition, b: Composition): boolean =>
	a.variable === b.variable && sourcesEqual(a.overlays, b.overlays);

/** Preset dont la composition (après découpage) est identique à `c`. */
export const matchPresetComposition = (c: Composition): ChartPreset | undefined =>
	chartPresets.find((preset) => compositionsEqual(splitChartSources(preset.sources), c));

/** Superposition ajoutée par défaut : flèches pour le vent, isolignes sinon. */
export const defaultOverlayFor = (variable: string, arrowsEnabled: boolean): ChartSource =>
	arrowsEnabled && variableHasDirections(variable)
		? { variable, arrows: true }
		: { variable, contours: true };

/** Une source est disponible si le modèle fournit sa variable (stockée ou dérivée). */
export const isSourceAvailable = (
	source: ChartSource,
	metaVariables: readonly string[] | undefined
): boolean => {
	if (!metaVariables) return false;
	return variableAvailable(source.variable, new Set(metaVariables));
};

export interface OverlayContext {
	/** Variable du fond. */
	primary: string;
	/** Le fond dessine déjà ses isolignes. */
	primaryContours: boolean;
	/** Le fond dessine déjà ses flèches. */
	primaryArrows: boolean;
	/** Niveau des flèches de vent de l'overlay vent principal, ex. `10m`. */
	windArrowLevel: string | null;
}

/** Drapeaux effectifs d'une superposition, sans doublon avec le pipeline principal. */
export const effectiveOverlayFlags = (
	source: ChartSource,
	ctx: OverlayContext
): { raster: boolean; contours: boolean; arrows: boolean } => {
	const isPrimary = source.variable === ctx.primary;
	const arrowsRenderedByWind =
		ctx.primaryArrows &&
		(isPrimary || source.variable === `wind_u_component_${ctx.windArrowLevel}`);
	return {
		raster: !!source.raster && !isPrimary,
		contours: !!source.contours && !(isPrimary && ctx.primaryContours),
		arrows: !!source.arrows && variableHasDirections(source.variable) && !arrowsRenderedByWind
	};
};
