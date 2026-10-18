<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import InfoIcon from '@lucide/svelte/icons/info';

	import { basemapTheme } from '$lib/stores/basemap-theme';
	import { map } from '$lib/stores/map';
	import { desktop, sidebarWidth } from '$lib/stores/preferences';
	import {
		weatherAiCones,
		weatherAiLayers,
		weatherAiRun,
		weatherAiStatus,
		weatherAiTime
	} from '$lib/stores/weather-ai';

	import { CONES_MENTION } from '$lib/weather-ai/cones';
	import { stepValidTime, useWeatherAi } from '$lib/weather-ai/controller';
	import { leadHours, runValidTimes } from '$lib/weather-ai/loader';
	import { syncWeatherAiLayers } from '$lib/weather-ai/map-layers';
	import { formatLead, formatUtc } from '$lib/weather-ai/render';

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
	const lead = $derived(
		$weatherAiTime ? leadHours($weatherAiRun?.initTime, $weatherAiTime) : undefined
	);
	const elapsed = $derived($weatherAiTime ? Date.parse($weatherAiTime) < Date.now() : false);
	const showCones = $derived(
		$weatherAiLayers.cones &&
			!!$weatherAiCones?.doc &&
			$weatherAiCones.runId === $weatherAiRun?.runId
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

		{#if $weatherAiRun?.demo}
			<p
				class="mt-1 rounded bg-violet-400/20 px-2 py-1 text-[11px] leading-snug text-violet-100"
				role="note"
			>
				Démonstration hors API : trajectoires archivées du run de référence (18/10/2026 00Z), cônes
				fictifs construits d'après le schéma. Pas une prévision en cours.
			</p>
		{/if}
		{#if $weatherAiRun && $weatherAiTime}
			<div class="mt-1.5 flex items-center gap-1">
				<button
					type="button"
					class="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-white/70 hover:bg-white/10 disabled:opacity-30"
					onclick={() => stepValidTime(-1)}
					disabled={index <= 0}
					aria-label="Échéance précédente"><ChevronLeftIcon class="size-4" /></button
				>
				<div class="min-w-0 flex-1 text-center text-xs tabular-nums">
					<span class="font-semibold">{formatLead(lead)}</span>
					<span class="text-white/70">· {formatUtc($weatherAiTime)}</span>
					{#if elapsed}<span class="text-amber-200/80"> · écoulée</span>{/if}
				</div>
				<button
					type="button"
					class="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-white/70 hover:bg-white/10 disabled:opacity-30"
					onclick={() => stepValidTime(1)}
					disabled={index >= times.length - 1}
					aria-label="Échéance suivante"><ChevronRightIcon class="size-4" /></button
				>
			</div>
			<p class="truncate font-mono text-[10px] text-white/45" title={$weatherAiRun.runId}>
				run {$weatherAiRun.runId}
			</p>
		{:else if $weatherAiStatus.state === 'error'}
			<p class="mt-1 text-[11px] text-red-200">{$weatherAiStatus.message}</p>
		{:else}
			<p class="mt-1 text-[11px] text-white/55">Chargement du run…</p>
		{/if}

		{#if showCones}
			<p class="mt-1 text-[11px] leading-snug text-amber-100">{CONES_MENTION}</p>
		{/if}

		{#if infoOpen}
			<div class="mt-2 border-t border-white/10 pt-2"><WeatherAiMentions /></div>
		{/if}
	</div>
{/if}
