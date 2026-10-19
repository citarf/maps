// Produits Weather AI que le front sait afficher. Ce n'est PAS la liste des
// couches : elle vient du catalogue (`GET /products`) ; un `product_id` présent
// ici mais absent du catalogue n'est pas proposé, et un `product_id` du
// catalogue absent d'ici est ignoré proprement tant qu'on ne sait pas le rendre.
// Tant que le portail ne sert pas `products[].presentation`, le rendu de chaque
// produit connu est défini ici ; le contrat (schéma, variable, unité) est
// re-vérifié sur chaque document reçu.
import { CONES_PRODUCT_ID } from './cones';

import type { Catalog } from './api';

export type ProductKind = 'mslp' | 'existence' | 'tracks' | 'cones';

export interface ProductSpec {
	kind: ProductKind;
	label: string;
	/** Préfixe attendu de `schema_version` (les versions mineures évoluent). */
	schemaPrefix: string;
	/** Grilles : variable et unité stockées attendues. */
	variable?: string;
	unit?: string;
}

export const PRODUCT_SPECS: Record<string, ProductSpec> = {
	'global-mslp-1deg': {
		kind: 'mslp',
		label: 'Pression au niveau de la mer',
		schemaPrefix: 'carto-grid-product/1.',
		variable: 'mean_sea_level_pressure',
		unit: 'Pa'
	},
	'global-cyclone-existence-1deg': {
		kind: 'existence',
		label: "Probabilité d'existence cyclonique",
		schemaPrefix: 'carto-grid-product/1.',
		variable: 'cyclone_exists_gaussian_unit_mode',
		unit: '1'
	},
	'global-cyclone-tracks-1deg': {
		kind: 'tracks',
		label: 'Trajectoires cycloniques',
		schemaPrefix: 'cyclone-tracks-product/1.'
	},
	[CONES_PRODUCT_ID]: {
		kind: 'cones',
		label: "Cônes d'incertitude",
		schemaPrefix: 'cyclone-cones-public-product/1.'
	}
};

export interface DiscoveredProduct {
	productId: string;
	spec: ProductSpec;
	attribution: string;
	licenseNotice: string;
}

/**
 * Déduplique les `product_id` du catalogue (une entrée par échéance) et sépare
 * ceux qu'on sait afficher des inconnus, ignorés sans erreur.
 */
export function discoverProducts(catalog: Catalog): {
	known: DiscoveredProduct[];
	ignored: string[];
} {
	const seen = new Map<string, DiscoveredProduct>();
	const ignored = new Set<string>();
	for (const entry of catalog.produits) {
		const spec = PRODUCT_SPECS[entry.product_id];
		if (!spec) {
			ignored.add(entry.product_id);
			continue;
		}
		if (!seen.has(entry.product_id)) {
			seen.set(entry.product_id, {
				productId: entry.product_id,
				spec,
				attribution: entry.attribution,
				licenseNotice: entry.license_notice
			});
		}
	}
	return { known: [...seen.values()], ignored: [...ignored] };
}
