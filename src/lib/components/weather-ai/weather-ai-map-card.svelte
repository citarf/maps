<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import InfoIcon from '@lucide/svelte/icons/info';

	import { basemapTheme } from '$lib/stores/basemap-theme';
	import { map } from '$lib/stores/map';
	import { desktop, sidebarWidth } from '$lib/stores/preferences';
	import {
		weatherAiCones,
		weatherAiDisplayed,
		weatherAiLayers,
		weatherAiRun,
		weatherAiStatus,
		weatherAiTime
	} from '$lib/stores/weather-ai';

	import { CONES_MENTION } from '$lib/weather-ai/cones';
	import { stepValidTime, useWeatherAi } from '$lib/weather-ai/controller';
	import { cardSummary } from '$lib/weather-ai/displayed';
	import { leadHours, runValidTimes } from '$lib/weather-ai/loader';
	import { syncWeatherAiLayers } from '$lib/weather-ai/map-layers';
	import { formatLead } from '$lib/weather-ai/render';

	import WeatherAiMentions from './weather-ai-mentions.svelte';

	// Carte flottante sur la carte, visible dès qu'une couche Weather AI est active :
	// porte les mentions qui doivent rester lisibles sans interaction (badge,
	// avertissement, UTC, échéance, run_id) même panneau replié, et le pas à pas.
	const anyOn = $derived(Object.values($weatherAiLayers).some(Boolean));

	// Une couche active (persistée) suffit à charger le run, onglet fermé ou non.
	$effect(() => {
		if (anyOn) return useWeatherAi();
	});

	// Toute évolution d'état se répercute sur la carte.
	$effect(() => {
		const _deps = [
			$map,
			$weatherAiLayers,
			$weatherAiRun,
			$weatherAiTime,
			$weatherAiCones,
			$basemapTheme
		];
		void syncWeatherAiLayers();
	});

	let infoOpen = $state(false);
	const times = $derived($weatherAiRun ? runValidTimes($weatherAiRun) : []);
	const index = $derived(times.indexOf($weatherAiTime ?? ''));
	// Les mentions décrivent ce que la carte montre RÉELLEMENT (état affiché),
	// pas la sélection, qui peut être en chargement ou avoir échoué (délai dépassé).
	const summary = $derived(
		cardSummary(
			$weatherAiDisplayed,
			{ runId: $weatherAiRun?.runId, validTime: $weatherAiTime },
			$weatherAiStatus,
			Date.now()
		)
	);
	const selectedLead = $derived(
		$weatherAiTime ? formatLead(leadHours($weatherAiRun?.initTime, $weatherAiTime)) : ''
	);
	const showCones = $derived(
		$weatherAiLayers.cones &&
			!!$weatherAiCones?.doc &&
			$weatherAiCones.runId === $weatherAiDisplayed?.runId
	);
</script>

{#if anyOn}
	<div
		class="bg-glass/90 fixed top-[82px] z-40 w-[min(340px,calc(100vw-24px))] rounded-xl border border-white/15 px-3 py-2 text-white shadow-lg glass-blur transition-[left] duration-200 motion-reduce:transition-none"
		style="left: {(desktop.current ? $sidebarWidth : 0) + 12}px"
		role="region"
		aria-label="Couches expérimentales Weather AI"
	>
		<div class="flex items-center gap-2">
			<span
				class="rounded bg-amber-300 px-1.5 py-px text-[10px] font-bold tracking-wide text-slate-950 uppercase"
				>Expérimental</span
			>
			<span class="text-xs font-semibold">Cyclones IA</span>
			<button
				type="button"
				class="ml-auto inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
				aria-label="Sources, attribution et licence"
				aria-expanded={infoOpen}
				onclick={() => (infoOpen = !infoOpen)}><InfoIcon class="size-4" /></button
			>
		</div>
		<p class="mt-1 text-[11px] leading-snug font-medium text-amber-100">
			Prévision expérimentale — ne remplace aucune alerte, vigilance ou bulletin officiel.
		</p>

		{#if summary.shown?.demo}
			<p
				class="mt-1 rounded bg-violet-400/20 px-2 py-1 text-[11px] leading-snug text-violet-100"
				role="note"
			>
				Démonstration hors API : trajectoires archivées du run de référence (18/10/2026 00Z), cônes
				fictifs construits d'après le schéma. Pas une prévision en cours.
			</p>
		{/if}
		{#if summary.shown || $weatherAiTime}
			<div class="mt-1.5 flex items-center gap-1">
				<button
					type="button"
					class="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-white/70 hover:bg-white/10 disabled:opacity-30"
					onclick={() => stepValidTime(-1)}
					disabled={index <= 0}
					aria-label="Échéance précédente"><ChevronLeftIcon class="size-4" /></button
				>
				<div class="min-w-0 flex-1 text-center text-xs tabular-nums">
					{#if summary.shown}
						<span class="font-semibold">{summary.shown.lead}</span>
						<span class="text-white/70">· {summary.shown.utc}</span>
						{#if summary.shown.elapsed}<span class="text-amber-200/80"> · écoulée</span>{/if}
					{:else}
						<span class="text-white/55">Aucune donnée affichée</span>
					{/if}
				</div>
				<button
					type="button"
					class="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-white/70 hover:bg-white/10 disabled:opacity-30"
					onclick={() => stepValidTime(1)}
					disabled={index >= times.length - 1}
					aria-label="Échéance suivante"><ChevronRightIcon class="size-4" /></button
				>
			</div>
			{#if summary.shown}
				<p class="truncate font-mono text-[10px] text-white/45" title={summary.shown.runId}>
					run {summary.shown.runId}
				</p>
			{/if}
			{#if summary.pending && !summary.error}
				<p class="text-[11px] text-white/55">Chargement de {selectedLead || 'la sélection'}…</p>
			{/if}
		{:else if !summary.error}
			<p class="mt-1 text-[11px] text-white/55">Chargement du run…</p>
		{/if}

		<!-- Erreur toujours visible, qu'un état soit affiché ou non (panneau replié compris). -->
		{#if summary.error}
			<p
				class="mt-1 rounded bg-red-500/15 px-2 py-1 text-[11px] leading-snug text-red-200"
				role="alert"
			>
				{summary.error}{#if summary.shown && summary.pending}
					Données affichées : {summary.shown.lead} · {summary.shown.utc}.{/if}
			</p>
		{/if}

		{#if showCones}
			<p class="mt-1 text-[11px] leading-snug text-amber-100">{CONES_MENTION}</p>
		{/if}

		{#if infoOpen}
			<div class="mt-2 border-t border-white/10 pt-2"><WeatherAiMentions /></div>
		{/if}
	</div>
{/if}
