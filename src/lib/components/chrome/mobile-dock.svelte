<script lang="ts">
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import LayersIcon from '@lucide/svelte/icons/layers';

	import { overlays } from '$lib/stores/composition';
	import { pointWorkspace } from '$lib/stores/point-workspace';
	import { bottomChromeHeight, sidebarTab } from '$lib/stores/preferences';

	import * as Sheet from '$lib/components/ui/sheet';

	import PanelContent from './panel-content.svelte';
	import { SIDEBAR_TABS } from './sidebar-tabs';

	import type { Snippet } from 'svelte';

	interface Props {
		capture?: Snippet;
	}
	let { capture }: Props = $props();

	let open = $state(false);
</script>

<!-- FAB + poignée masqués quand le tiroir météogramme est ouvert : il couvre la
     moitié basse de l'écran, ces éléments flottants le chevaucheraient (z-60 > z-40). -->
{#if !$pointWorkspace.open}
	<!-- FAB capture, décalé à gauche des contrôles MapLibre (bas-droite), au-dessus de la poignée -->
	<div class="fixed right-16 z-60" style="bottom: calc({$bottomChromeHeight}px + 4.5rem)">
		{@render capture?.()}
	</div>

	<!-- Poignée d'ouverture du bottom-sheet, au-dessus de la timeline -->
	<button
		type="button"
		onclick={() => (open = true)}
		aria-expanded={open}
		class="bg-glass/85 hover:bg-glass/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 fixed left-1/2 z-60 flex h-11 -translate-x-1/2 cursor-pointer items-center gap-2 rounded-lg border border-white/20 px-4 text-sm text-white shadow-md glass-blur"
		style="bottom: calc({$bottomChromeHeight}px + 0.5rem)"
	>
		<LayersIcon class="size-4" aria-hidden="true" />
		Données &amp; carte
		<ChevronUpIcon class="size-4 opacity-60" aria-hidden="true" />
	</button>
{/if}

<Sheet.Root bind:open>
	<Sheet.Content
		side="bottom"
		class="bg-glass/90 z-100 flex max-h-[85vh] flex-col gap-0 border-none text-white backdrop-blur-xl"
	>
		<Sheet.Title class="sr-only">Données &amp; carte</Sheet.Title>
		<!-- Onglets segmentés (cibles ≥ 44 px), mêmes sections que la sidebar desktop ;
		     le corps seul défile. -->
		<div
			role="tablist"
			aria-label="Réglages carte"
			class="mt-4 mr-12 ml-4 flex shrink-0 gap-1 rounded-xl bg-white/[0.06] p-1"
		>
			{#each SIDEBAR_TABS as tab (tab.key)}
				{@const active = $sidebarTab === tab.key}
				{@const badge = tab.key === 'compositions' ? $overlays.length : 0}
				<button
					type="button"
					role="tab"
					aria-selected={active}
					onclick={() => sidebarTab.set(tab.key)}
					class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors {active
						? 'bg-white/12 text-sky-300 shadow-sm'
						: 'text-white/65 hover:text-white'}"
				>
					<tab.icon class="size-4 shrink-0" aria-hidden="true" />
					<span class="truncate">{tab.label}</span>
					{#if badge}
						<span
							class="rounded-full bg-sky-400 px-1.5 text-[10px] font-semibold text-slate-950 tabular-nums"
							>{badge}</span
						>
					{/if}
				</button>
			{/each}
		</div>
		<div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-8">
			<PanelContent tab={$sidebarTab} />
		</div>
	</Sheet.Content>
</Sheet.Root>
