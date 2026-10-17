<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';
	import { slide } from 'svelte/transition';

	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import HelpIcon from '@lucide/svelte/icons/circle-question-mark';
	import PanelLeftCloseIcon from '@lucide/svelte/icons/panel-left-close';
	import PanelLeftOpenIcon from '@lucide/svelte/icons/panel-left-open';

	import { helpOpen, sidebarCollapsed, sidebarWidth } from '$lib/stores/preferences';

	import CompositionPanel from '$lib/components/composition/composition-panel.svelte';

	import LayerList from './layer-list.svelte';
	import ModelSelector from './model-selector.svelte';

	import type { Snippet } from 'svelte';

	interface Props {
		display?: Snippet;
		style?: Snippet;
	}
	let { display, style }: Props = $props();

	const OPEN_W = 288; // = w-72
	const RAIL_W = 44; // = w-11

	const reduceMotion = new MediaQuery('(prefers-reduced-motion: reduce)');

	// Sections dépliables (état local, non persisté). Calques ouvert (action
	// principale) ; Compositions, Affichage et Style repliés par défaut pour
	// garder la sidebar compacte — on les déplie au besoin.
	let layersOpen = $state(true);
	let compositionsOpen = $state(false);
	let displayOpen = $state(false);
	let styleOpen = $state(false);

	// Publie la largeur occupée pour que timeline/légende se décalent.
	$effect(() => {
		sidebarWidth.set($sidebarCollapsed ? RAIL_W : OPEN_W);
	});

	// Remise à zéro au démontage uniquement (mobile) — pas à chaque bascule.
	$effect(() => {
		return () => sidebarWidth.set(0);
	});
</script>

{#snippet sectionHeader(title: string, open: boolean, toggle: () => void)}
	<button
		type="button"
		class="hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 flex min-h-9 w-full cursor-pointer items-center justify-between rounded-md px-2 text-xs font-semibold tracking-wide text-white/45 uppercase"
		aria-expanded={open}
		onclick={toggle}
	>
		{title}
		<ChevronDownIcon
			class="size-4 transition-transform duration-200 motion-reduce:transition-none {open
				? 'rotate-180'
				: ''}"
			aria-hidden="true"
		/>
	</button>
{/snippet}

<!-- Sidebar sous le header (top-11 = 44 px), pleine hauteur restante, repliable
     en rail d'icônes. La largeur est animée en CSS (transition-[width]) — pas de
     transform : le contenu carte derrière n'est pas déplacé. -->
<aside
	class="bg-glass/95 fixed top-11 bottom-0 left-0 z-50 flex flex-col overflow-hidden border-r border-white/15 text-white shadow-lg glass-blur transition-[width] duration-200 motion-reduce:transition-none"
	style="width: {$sidebarCollapsed ? RAIL_W : OPEN_W}px"
	aria-label="Réglages carte"
>
	{#if $sidebarCollapsed}
		<button
			type="button"
			onclick={() => sidebarCollapsed.set(false)}
			aria-label="Déplier les réglages carte"
			title="Réglages carte"
			class="hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 mx-auto mt-2 inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-white/70 hover:text-white"
		>
			<PanelLeftOpenIcon class="size-4" aria-hidden="true" />
		</button>
		<button
			type="button"
			onclick={() => helpOpen.set(true)}
			aria-label="Aide"
			title="Aide"
			class="hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 mx-auto mt-auto mb-2 inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-white/70 transition-colors hover:text-white"
		>
			<HelpIcon class="size-4" aria-hidden="true" />
		</button>
	{:else}
		<div class="flex shrink-0 items-center justify-end px-3 pt-3 pb-2">
			<button
				type="button"
				onclick={() => sidebarCollapsed.set(true)}
				aria-label="Replier les réglages carte"
				title="Replier"
				class="hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 -mr-1 inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-white/70 hover:text-white"
			>
				<PanelLeftCloseIcon class="size-4" aria-hidden="true" />
			</button>
		</div>

		<div class="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-3">
			<!-- Haut de sidebar : sélecteur de modèle (le run/échéance reste dans la timeline) -->
			<ModelSelector />

			<section>
				{@render sectionHeader('Calques', layersOpen, () => (layersOpen = !layersOpen))}
				{#if layersOpen}
					<div transition:slide={{ duration: reduceMotion.current ? 0 : 200 }}>
						<LayerList />
					</div>
				{/if}
			</section>

			<section>
				{@render sectionHeader(
					'Compositions',
					compositionsOpen,
					() => (compositionsOpen = !compositionsOpen)
				)}
				{#if compositionsOpen}
					<div transition:slide={{ duration: reduceMotion.current ? 0 : 200 }}>
						<CompositionPanel />
					</div>
				{/if}
			</section>

			{#if display}
				<section>
					{@render sectionHeader('Affichage', displayOpen, () => (displayOpen = !displayOpen))}
					{#if displayOpen}
						<div transition:slide={{ duration: reduceMotion.current ? 0 : 200 }}>
							{@render display()}
						</div>
					{/if}
				</section>
			{/if}

			{#if style}
				<section>
					{@render sectionHeader('Style', styleOpen, () => (styleOpen = !styleOpen))}
					{#if styleOpen}
						<div transition:slide={{ duration: reduceMotion.current ? 0 : 200 }}>
							{@render style()}
						</div>
					{/if}
				</section>
			{/if}
		</div>
		<!-- Pied de sidebar : accès direct à l'aide (utilitaire persistant). -->
		<div class="shrink-0 border-t border-white/10 px-3 py-2">
			<button
				type="button"
				onclick={() => helpOpen.set(true)}
				class="hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 text-left text-sm text-white/70 transition-colors hover:text-white"
			>
				<HelpIcon class="size-[18px] shrink-0 text-white/55" aria-hidden="true" />
				Aide
			</button>
		</div>
	{/if}
</aside>
