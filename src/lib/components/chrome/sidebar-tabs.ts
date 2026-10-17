import LayersIcon from '@lucide/svelte/icons/layers';
import LayersPlusIcon from '@lucide/svelte/icons/layers-plus';
import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';

import type { SidebarTab } from '$lib/stores/preferences';
import type { Component } from 'svelte';

export interface SidebarTabDef {
	key: SidebarTab;
	label: string;
	/** Sous-titre de l'en-tête du panneau : ce que l'onglet permet de faire. */
	hint: string;
	icon: Component;
}

// Ordre = parcours type : choisir la donnée, la combiner, puis habiller la carte.
// Partagé par la sidebar desktop (rail) et le bottom-sheet mobile (onglets).
export const SIDEBAR_TABS: SidebarTabDef[] = [
	{ key: 'layers', label: 'Données', hint: 'Modèle et variable affichée', icon: LayersIcon },
	{
		key: 'compositions',
		label: 'Compositions',
		hint: 'Superposer plusieurs variables',
		icon: LayersPlusIcon
	},
	{
		key: 'map',
		label: 'Carte',
		hint: 'Isolignes, flèches, fond de carte',
		icon: SlidersHorizontalIcon
	}
];
