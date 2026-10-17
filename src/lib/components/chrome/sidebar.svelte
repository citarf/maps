<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';

	import HelpIcon from '@lucide/svelte/icons/circle-question-mark';
	import PanelLeftCloseIcon from '@lucide/svelte/icons/panel-left-close';

	import { overlays } from '$lib/stores/composition';
	import {
		type SidebarTab,
		helpOpen,
		sidebarCollapsed,
		sidebarTab,
		sidebarWidth
	} from '$lib/stores/preferences';

	import PanelContent from './panel-content.svelte';
	import { SIDEBAR_TABS } from './sidebar-tabs';

	const RAIL_W = 48; // = w-12
	// Plus étroit sous 1440 px (portables 13-14″) : la carte garde ~75 % de la largeur.
	const wide = new MediaQuery('min-width: 1440px');
	const PANEL_W = $derived(wide.current ? 296 : 272);

	const current = $derived(SIDEBAR_TABS.find((t) => t.key === $sidebarTab) ?? SIDEBAR_TABS[0]);

	// Publie la largeur occupée pour que timeline/légende se décalent.
	$effect(() => {
		sidebarWidth.set($sidebarCollapsed ? RAIL_W : RAIL_W + PANEL_W);
	});

	// Remise à zéro au démontage uniquement (mobile) — pas à chaque bascule.
	$effect(() => {
		return () => sidebarWidth.set(0);
	});

	// Rail façon éditeur : clic sur l'onglet affiché → replie ; sur un autre
	// onglet (ou panneau replié) → l'ouvre directement.
	function selectTab(key: SidebarTab) {
		if (!$sidebarCollapsed && $sidebarTab === key) {
			sidebarCollapsed.set(true);
			return;
		}
		sidebarTab.set(key);
		sidebarCollapsed.set(false);
	}

	// Navigation flèches haut/bas dans le rail (pattern tablist vertical).
	function onRailKeydown(e: KeyboardEvent) {
		if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
		e.preventDefault();
		const tabs = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role=tab]')];
		const i = tabs.indexOf(document.activeElement as HTMLElement);
		const next = tabs[(i + (e.key === 'ArrowDown' ? 1 : tabs.length - 1)) % tabs.length];
		next?.focus();
	}

	const railButton =
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 relative inline-flex size-9 cursor-pointer items-center justify-center rounded-lg transition-colors';
</script>

<!-- Sidebar sous le header (top-11 = 44 px) : rail d'onglets toujours visible +
     panneau de l'onglet actif, repliable (seul le rail reste). La largeur est
     animée en CSS (transition-[width]) — pas de transform : la carte derrière
     n'est pas déplacée. -->
<aside
	class="bg-glass/95 fixed top-11 bottom-0 left-0 z-50 flex overflow-hidden border-r border-white/15 text-white shadow-lg glass-blur transition-[width] duration-200 motion-reduce:transition-none"
	style="width: {$sidebarCollapsed ? RAIL_W : RAIL_W + PANEL_W}px"
	aria-label="Réglages carte"
>
	<nav
		class="flex shrink-0 flex-col items-center gap-1 border-r border-white/10 py-2"
		style="width: {RAIL_W}px"
	>
		<div
			role="tablist"
			aria-label="Sections du panneau"
			aria-orientation="vertical"
			tabindex="-1"
			class="flex flex-col items-center gap-1"
			onkeydown={onRailKeydown}
		>
			{#each SIDEBAR_TABS as tab (tab.key)}
				{@const active = !$sidebarCollapsed && $sidebarTab === tab.key}
				{@const badge = tab.key === 'compositions' ? $overlays.length : 0}
				<button
					type="button"
					role="tab"
					id="sidebar-tab-{tab.key}"
					aria-selected={active}
					aria-controls="sidebar-panel"
					tabindex={$sidebarTab === tab.key ? 0 : -1}
					title={tab.label}
					onclick={() => selectTab(tab.key)}
					class="{railButton} {active
						? 'bg-white/10 text-sky-300'
						: 'text-white/60 hover:bg-white/[0.06] hover:text-white'}"
				>
					<!-- Barre d'onglet actif collée au bord gauche du rail -->
					{#if active}
						<span class="absolute top-1.5 bottom-1.5 -left-1.5 w-0.5 rounded-full bg-sky-300"
						></span>
					{/if}
					<tab.icon class="size-[18px]" aria-hidden="true" />
					<span class="sr-only">{tab.label}</span>
					{#if badge}
						<span
							class="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-sky-400 text-[10px] font-semibold text-slate-950 tabular-nums"
							aria-label="{badge} superposition(s)">{badge}</span
						>
					{/if}
				</button>
			{/each}
		</div>
		<button
			type="button"
			onclick={() => helpOpen.set(true)}
			aria-label="Aide"
			title="Aide (h)"
			class="{railButton} mt-auto text-white/60 hover:bg-white/[0.06] hover:text-white"
		>
			<HelpIcon class="size-[18px]" aria-hidden="true" />
		</button>
	</nav>

	{#if !$sidebarCollapsed}
		<div
			id="sidebar-panel"
			role="tabpanel"
			aria-labelledby="sidebar-tab-{current.key}"
			class="flex min-w-0 flex-col"
			style="width: {PANEL_W}px"
		>
			<header class="flex shrink-0 items-center gap-2 px-4 pt-3 pb-2">
				<div class="min-w-0 flex-1">
					<h2 class="truncate text-[15px] leading-tight font-semibold">{current.label}</h2>
					<p class="truncate text-xs text-white/45 [@media(max-height:820px)]:hidden">
						{current.hint}
					</p>
				</div>
				<button
					type="button"
					onclick={() => sidebarCollapsed.set(true)}
					aria-label="Replier le panneau"
					title="Replier"
					class="hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 -mr-1.5 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-white/60 hover:text-white"
				>
					<PanelLeftCloseIcon class="size-4" aria-hidden="true" />
				</button>
			</header>
			<div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-4">
				<PanelContent tab={current.key} />
			</div>
		</div>
	{/if}
</aside>
