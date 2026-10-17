/**
 * Modèle de graphique : tout ce qui s'affiche sur la carte est un graphique.
 * Un graphique est une liste de sources ; chaque source est une variable avec
 * des interrupteurs individuels pour les types de couches rendus (aplat
 * raster, isolignes, flèches de vent). Une sélection simple d'une seule
 * variable est un graphique à une source raster.
 */

export interface ChartSource {
	/** Identifiant complet de la variable, suffixe de niveau inclus, ex. `temperature_850hPa`. */
	variable: string;
	/** Afficher la couche raster (aplat de couleurs) de cette source. Défaut : false */
	raster?: boolean;
	/** Afficher les isolignes de cette source. Défaut : false */
	contours?: boolean;
	/** Intervalle des isolignes. Non défini = seuils de l'échelle de couleurs. */
	contourInterval?: number;
	/** Afficher les flèches de vent de cette source. Défaut : false */
	arrows?: boolean;
	/**
	 * Multiplicateur d'opacité du raster (0..1) appliqué en plus de la
	 * préférence d'opacité globale. Non modifiable dans l'UI ; porté par
	 * l'encodage URL `sources` via le drapeau `o`.
	 */
	opacity?: number;
	/**
	 * Multiplicateur d'épaisseur des isolignes et des flèches de cette source.
	 * Non modifiable dans l'UI ; porté par l'encodage `sources` via le
	 * drapeau `w`.
	 */
	lineWidth?: number;
	/**
	 * Dessiner les isolignes/flèches de cette source directement au-dessus de
	 * son propre raster (dans la pile des rasters) plutôt que dans la pile
	 * vectorielle haute. Les rasters des sources suivantes les recouvrent
	 * alors. Non modifiable dans l'UI ; porté par l'encodage `sources` via
	 * le drapeau `i`.
	 */
	inlineVectors?: boolean;
}

export interface ChartPreset {
	/** Identifiant unique, aussi utilisé comme paramètre d'URL `chart`. */
	id: string;
	/** Nom lisible affiché dans le sélecteur. */
	label: string;
	/** Description sur une ligne affichée sous le libellé. */
	description?: string;
	/** Libellé de regroupement (ex. « Synoptique », « Surface »). */
	group?: string;
	/** Une ou plusieurs sources affichées ensemble sur la carte. */
	sources: ChartSource[];
}
