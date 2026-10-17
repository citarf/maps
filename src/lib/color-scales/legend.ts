import type { CategoricalColorScale } from './types';
import type { ColorScale, RGBA, RenderableColorScale } from '@openmeteo/weather-map-layer';

export interface CategoricalLegendEntry {
	color: RGBA;
	label: string;
	code: number;
	/** Index dans `colors` / `breakpoints` (pour l'édition de couleur éventuelle). */
	index: number;
}

/** Vrai si l'échelle porte des catégories discrètes (champ `categories`). */
export function isCategorical(
	scale: ColorScale | RenderableColorScale
): scale is (ColorScale | RenderableColorScale) & CategoricalColorScale {
	const maybe = scale as Partial<CategoricalColorScale>;
	return Array.isArray(maybe.categories);
}

/**
 * Entrées de légende pour une échelle catégorielle, alignées index-par-index sur
 * `colors` / `breakpoints` / `categories`. L'entrée code 0 (aucune) est conservée
 * (l'appelant décide de l'afficher ou non).
 */
export function categoricalLegendEntries(scale: CategoricalColorScale): CategoricalLegendEntry[] {
	if (scale.colors.length !== scale.categories.length) {
		throw new Error(
			`CategoricalColorScale mal formée : colors.length (${scale.colors.length}) ≠ categories.length (${scale.categories.length})`
		);
	}
	return scale.categories.map((cat, index) => ({
		color: scale.colors[index],
		label: cat.label,
		code: cat.code,
		index
	}));
}

/**
 * Hauteur (px) d'un palier de légende : `max` idéalement, réduite pour que les
 * `count` paliers tiennent dans `available` px (petits écrans), sans descendre
 * sous `min` — en deçà la légende déborde plutôt que de devenir illisible.
 */
export function legendBlockHeight(count: number, available: number, max = 20, min = 8): number {
	if (count <= 0) return max;
	return Math.max(min, Math.min(max, Math.floor(available / count)));
}

/** Pas d'affichage des libellés (1 = tous, 2 = un sur deux…) pour qu'ils ne se chevauchent pas. */
export function legendLabelStep(blockHeight: number, labelHeight = 14): number {
	return Math.max(1, Math.ceil(labelHeight / blockHeight));
}
