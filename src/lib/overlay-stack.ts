/**
 * Rendu des superpositions d'une composition de cartes (isolignes, flèches,
 * aplats empilés sur le fond). Chaque couche de superposition a son propre
 * `SlotManager` (double tampon A/B), rattaché au groupe de commit de
 * `layers.ts` pour un fondu synchronisé avec le pipeline principal.
 *
 * Les fonctions de planification sont pures (testées sans carte) ; la classe
 * `OverlayStack` se contente d'aligner les managers sur le plan.
 *
 * `inlineVectors` (isolignes/flèches insérées dans la pile des rasters) est
 * ignoré en v1 : les vecteurs de superposition vont toujours dans la pile
 * vectorielle haute.
 */
import * as maplibregl from 'maplibre-gl';

import { type OverlayContext, effectiveOverlayFlags, isSourceAvailable } from '$lib/composition';
import { type SlotLayer, SlotManager } from '$lib/slot-manager';

import type { ChartSource } from '$lib/chart-types';
import type { getOverlayOmUrl } from '$lib/url';

export interface OverlayLayerPlan {
	/** Identité stable de la couche : `${index}:${variable}:${kind}`. */
	key: string;
	kind: 'raster' | 'vector';
	/** URL de la source (sans le préfixe `om://`). */
	url: string;
	source: ChartSource;
	/** Drapeaux effectifs, après dédoublonnage avec le pipeline principal. */
	flags: { raster: boolean; contours: boolean; arrows: boolean };
}

export type OverlayPlanContext = OverlayContext & {
	/** Variables publiées par le modèle courant (`metaJson.variables`). */
	metaVariables: readonly string[] | undefined;
};

/**
 * Couches de superposition à afficher. Saute les sources indisponibles sur le
 * domaine et celles qui ne dessinent plus rien une fois retiré ce que le fond
 * affiche déjà. Un plan `raster` si l'aplat est actif, un plan `vector` si des
 * isolignes ou des flèches le sont.
 */
export const desiredOverlayLayers = (
	overlays: ChartSource[],
	ctx: OverlayPlanContext,
	urlFor: typeof getOverlayOmUrl
): OverlayLayerPlan[] => {
	const plans: OverlayLayerPlan[] = [];
	overlays.forEach((source, index) => {
		if (!isSourceAvailable(source, ctx.metaVariables)) return;
		const flags = effectiveOverlayFlags(source, ctx);
		if (flags.raster) {
			// L'aplat ne dépend pas des drapeaux vecteur : basculer les isolignes
			// d'une superposition ne recharge pas son aplat.
			const url = urlFor(source, { contours: false, arrows: false });
			if (url) {
				plans.push({
					key: `${index}:${source.variable}:raster`,
					kind: 'raster',
					url,
					source,
					flags
				});
			}
		}
		if (flags.contours || flags.arrows) {
			const url = urlFor(source, { contours: flags.contours, arrows: flags.arrows });
			if (url) {
				plans.push({
					key: `${index}:${source.variable}:vector`,
					kind: 'vector',
					url,
					source,
					flags
				});
			}
		}
	});
	return plans;
};

/**
 * Écart entre les couches actives (`current` : clé → URL chargée) et le plan :
 * ne recharge que les clés nouvelles ou dont l'URL a changé, retire les autres.
 */
export const planOverlayUpdates = (
	current: ReadonlyMap<string, string>,
	desired: OverlayLayerPlan[]
): { update: OverlayLayerPlan[]; remove: string[] } => {
	const desiredKeys = new Set(desired.map((plan) => plan.key));
	return {
		update: desired.filter((plan) => current.get(plan.key) !== plan.url),
		remove: [...current.keys()].filter((key) => !desiredKeys.has(key))
	};
};

export interface OverlayStackHooks {
	/** Tuiles chargées, commit en attente (coordinateur de `layers.ts`). */
	onReady: () => void;
	/** Source en erreur (p. ex. 404 sur un domaine) : la couche est déjà effacée. */
	onError: (mgr: SlotManager) => void;
	/** Point d'insertion des aplats de superposition. */
	rasterBefore: () => string;
	/** Point d'insertion des isolignes/flèches de superposition. */
	vectorBefore: () => string;
	/**
	 * Couches MapLibre d'un plan. Fournies par `layers.ts` (qui possède les
	 * builders partagés avec le pipeline principal) pour éviter un cycle
	 * d'imports. `tag` rend les identifiants de couches uniques.
	 */
	layers: (plan: OverlayLayerPlan, tag: string) => SlotLayer[];
}

interface OverlayEntry {
	manager: SlotManager;
	/** URL demandée en dernier (déduplication, même si le chargement a échoué). */
	url: string;
	plan: OverlayLayerPlan;
}

// Compteur au niveau module : une pile recréée (rechargement de style) ne doit
// jamais réutiliser l'identifiant de source d'un manager détruit, dont un
// `removeSlot` différé purgerait sinon la source du nouveau.
let managerSeq = 0;

export class OverlayStack {
	private map: maplibregl.Map;
	private hooks: OverlayStackHooks;
	private entries = new Map<string, OverlayEntry>();

	constructor(map: maplibregl.Map, hooks: OverlayStackHooks) {
		this.map = map;
		this.hooks = hooks;
	}

	/**
	 * Aligne les managers sur le plan : détruit les couches retirées, crée les
	 * manquantes et renvoie les managers à recharger avec leur URL. Ne lance
	 * aucun `update()` : l'appelant doit d'abord les ajouter au groupe de commit
	 * (`beginCommitGroup`), puis appeler `manager.update('om://' + url)`.
	 */
	sync(plans: OverlayLayerPlan[]): { manager: SlotManager; url: string }[] {
		const current = new Map([...this.entries].map(([key, entry]) => [key, entry.url]));
		const { update, remove } = planOverlayUpdates(current, plans);

		for (const key of remove) {
			this.entries.get(key)?.manager.destroy();
			this.entries.delete(key);
		}

		// Points d'insertion relus à chaque passage (hillshade, masque océans…).
		for (const entry of this.entries.values()) {
			entry.manager.setBeforeLayer(this.beforeLayerFor(entry.plan.kind));
		}

		const toLoad: { manager: SlotManager; url: string }[] = [];
		for (const plan of update) {
			let entry = this.entries.get(plan.key);
			if (entry) {
				entry.url = plan.url;
				entry.plan = plan;
			} else {
				entry = this.createEntry(plan);
				this.entries.set(plan.key, entry);
			}
			toLoad.push({ manager: entry.manager, url: plan.url });
		}
		return toLoad;
	}

	/** Managers vecteur actifs (rechargés par `reloadVectorStyle`). */
	vectorManagers(): SlotManager[] {
		return [...this.entries.values()]
			.filter((entry) => entry.plan.kind === 'vector')
			.map((entry) => entry.manager);
	}

	destroyAll(): void {
		for (const entry of this.entries.values()) entry.manager.destroy();
		this.entries.clear();
	}

	private beforeLayerFor(kind: OverlayLayerPlan['kind']): string {
		return kind === 'raster' ? this.hooks.rasterBefore() : this.hooks.vectorBefore();
	}

	private createEntry(plan: OverlayLayerPlan): OverlayEntry {
		const tag = String(managerSeq++);
		const isRaster = plan.kind === 'raster';
		// `entry` est lu par la layerFactory au moment de chaque `update()` : elle
		// suit donc le plan courant (drapeaux, opacité, épaisseur).
		const entry = { url: plan.url, plan } as OverlayEntry;
		const manager: SlotManager = new SlotManager(this.map, {
			sourceIdPrefix: `omOverlaySource_${tag}`,
			beforeLayer: this.beforeLayerFor(plan.kind),
			layerFactory: () => this.hooks.layers(entry.plan, tag),
			sourceSpec: (sourceUrl) =>
				isRaster
					? { url: sourceUrl, type: 'raster', maxzoom: 14 }
					: { url: sourceUrl, type: 'vector' },
			removeDelayMs: isRaster ? 300 : 250,
			// Variable absente du domaine (404) : on efface la couche plutôt que de
			// laisser celle du modèle précédent figée. Pas de toast (répété à chaque
			// pas de temps) : la superposition disparaît simplement.
			clearOnError: true,
			deferCommit: true,
			onReady: this.hooks.onReady,
			onError: () => this.hooks.onError(manager)
		});
		entry.manager = manager;
		return entry;
	}
}
