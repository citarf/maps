<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ConeIcon from '@lucide/svelte/icons/cone';
	import GaugeIcon from '@lucide/svelte/icons/gauge';
	import RouteIcon from '@lucide/svelte/icons/route';
	import TornadoIcon from '@lucide/svelte/icons/tornado';

	import {
		weatherAiCones,
		weatherAiLayers,
		weatherAiRun,
		weatherAiStatus,
		weatherAiTime
	} from '$lib/stores/weather-ai';

	import LayerToggle from '$lib/components/chrome/layer-toggle.svelte';

	import { CONES_MENTION } from '$lib/weather-ai/cones';
	import { conesOffered, stepValidTime, useWeatherAi } from '$lib/weather-ai/controller';
	import { leadHours, runValidTimes } from '$lib/weather-ai/loader';
	import { PROBABILITY_STOPS, formatLead, formatUtc } from '$lib/weather-ai/render';
	import { WIND_CLASSES, buildTracks, msToKmh } from '$lib/weather-ai/tracks';

	import WeatherAiMentions from './weather-ai-mentions.svelte';

	import type { ProductKind } from '$lib/weather-ai/products';
	import type { Component } from 'svelte';

	// L'onglet monté suffit à lire le catalogue (le menu en dépend).
	$effect(() => useWeatherAi());

	const ICONS: Record<ProductKind, Component> = {
		mslp: GaugeIcon,
		existence: TornadoIcon,
		tracks: RouteIcon,
		cones: ConeIcon
	};

	// Menu issu du catalogue : seuls les produits annoncés et connus sont proposés.
	const offered = $derived.by(() => {
		const run = $weatherAiRun;
		if (!run) return [];
		const items = run.available
			.filter((p) => p.spec.kind !== 'cones')
			.map((p) => ({ kind: p.spec.kind, label: p.spec.label }));
		if (conesOffered(run)) items.push({ kind: 'cones', label: "Cônes d'incertitude" });
		return items;
	});

	const times = $derived($weatherAiRun ? runValidTimes($weatherAiRun) : []);
	const index = $derived(times.indexOf($weatherAiTime ?? ''));
	const lead = $derived(
		$weatherAiTime ? leadHours($weatherAiRun?.initTime, $weatherAiTime) : undefined
	);
	const elapsed = $derived($weatherAiTime ? Date.parse($weatherAiTime) < Date.now() : false);

	const storms = $derived.by(() => {
		const run = $weatherAiRun;
		const p = run && Object.values(run.loaded).find((l) => l.kind === 'tracks');
		if (!run || p?.kind !== 'tracks') return { declared: [], candidates: 0 };
		const tracks = buildTracks(
			p.frames.map((f) => f.product),
			run.runId
		).filter((t) => t.member === 0);
		const declared = tracks
			.filter((t) => t.kind === 'declared')
			.map((t) => ({ label: t.label, now: t.points.find((pt) => pt.time === $weatherAiTime) }));
		const candidates = tracks.filter(
			(t) => t.kind === 'candidate' && t.points.some((pt) => pt.time === $weatherAiTime)
		).length;
		return { declared, candidates };
	});

	function toggle(kind: ProductKind, next: boolean) {
		weatherAiLayers.update((l) => ({ ...l, [kind]: next }));
	}

	const rgba = (c: number[]) => `rgba(${c[0]},${c[1]},${c[2]},${(c[3] / 255).toFixed(2)})`;
	const probabilityGradient = `linear-gradient(to right, ${PROBABILITY_STOPS.map(
		(s) => `${rgba(s.color)} ${s.value * 100}%`
	).join(', ')})`;
</script>

{#snippet group(title: string, body: import('svelte').Snippet)}
	<section class="flex flex-col gap-1.5">
		<h3 class="px-1 text-xs font-semibold text-white/80">{title}</h3>
		<div
			class="overflow-hidden rounded-xl bg-white/[0.04] [&>*+*]:border-t [&>*+*]:border-white/[0.06]"
		>
			{@render body()}
		</div>
	</section>
{/snippet}

<div class="flex flex-col gap-4">
	<!-- Avertissement permanent : la mention la plus importante d'un produit cyclone public. -->
	<div class="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2.5">
		<span
			class="inline-block rounded bg-amber-300 px-1.5 py-px text-[10px] font-bold tracking-wide text-slate-950 uppercase"
			>Expérimental</span
		>
		<p class="mt-1.5 text-xs leading-snug font-medium text-amber-100">
			Prévision expérimentale — ne remplace aucune alerte, vigilance ou bulletin officiel.
		</p>
		<p class="mt-1 text-[11px] leading-snug text-white/55">
			Modèle IA WeatherNext Cyclones Mini (Google DeepMind), initialisé sur ECMWF open data.
		</p>
	</div>

	{#if $weatherAiStatus.state === 'error'}
		<p class="rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200" role="alert">
			{$weatherAiStatus.message}{$weatherAiRun ? ' — le run affiché est conservé.' : ''}
		</p>
	{:else if !$weatherAiRun}
		<p class="px-1 text-xs text-white/55">Chargement du catalogue…</p>
	{/if}

	{#if $weatherAiRun?.demo}
		<p
			class="rounded-lg border border-violet-300/40 bg-violet-400/15 px-3 py-2 text-xs text-violet-100"
			role="note"
		>
			Démonstration hors API : trajectoires archivées du run de référence (18/10/2026 00Z), cônes
			fictifs construits d'après le schéma. Pas une prévision en cours.
		</p>
	{/if}

	{#if $weatherAiRun}
		{#snippet layersBody()}
			{#each offered as item (item.kind)}
				{@const Icon = ICONS[item.kind]}
				<LayerToggle
					label={item.label}
					checked={$weatherAiLayers[item.kind]}
					onCheckedChange={(v) => toggle(item.kind, v)}
				>
					{#snippet icon()}<Icon class="size-[18px]" aria-hidden="true" />{/snippet}
				</LayerToggle>
			{/each}
		{/snippet}
		{@render group('Couches', layersBody)}
		{#if $weatherAiRun.ignored.length}
			<p class="-mt-2 px-1 text-[11px] text-white/40">
				{$weatherAiRun.ignored.length} produit(s) du catalogue pas encore pris en charge.
			</p>
		{/if}

		{#snippet timeBody()}
			<div class="flex flex-col gap-2 px-3 py-2.5">
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"
						onclick={() => stepValidTime(-1)}
						disabled={index <= 0}
						aria-label="Échéance précédente"><ChevronLeftIcon class="size-4" /></button
					>
					<div class="min-w-0 flex-1 text-center tabular-nums">
						<div class="text-sm font-semibold">{formatLead(lead)}</div>
						<div class="text-[11px] text-white/60">
							{$weatherAiTime ? formatUtc($weatherAiTime) : ''}
						</div>
					</div>
					<button
						type="button"
						class="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"
						onclick={() => stepValidTime(1)}
						disabled={index >= times.length - 1}
						aria-label="Échéance suivante"><ChevronRightIcon class="size-4" /></button
					>
				</div>
				<input
					type="range"
					min="0"
					max={Math.max(times.length - 1, 0)}
					value={Math.max(index, 0)}
					oninput={(e) => weatherAiTime.set(times[Number(e.currentTarget.value)])}
					class="w-full accent-sky-400"
					aria-label="Échéance"
				/>
				{#if elapsed}
					<p class="text-[11px] text-amber-200/80">
						Échéance écoulée : raccord avec l'analyse, pas une prévision.
					</p>
				{/if}
			</div>
		{/snippet}
		{@render group('Échéance', timeBody)}

		{#if $weatherAiLayers.existence}
			<section class="flex flex-col gap-1 px-1">
				<h3 class="text-xs font-semibold text-white/80">Probabilité d'existence cyclonique</h3>
				<div class="h-2.5 rounded-sm" style="background: {probabilityGradient}"></div>
				<div class="flex justify-between text-[10px] text-white/50 tabular-nums">
					<span>0,05</span><span>0,5</span><span>1</span>
				</div>
			</section>
		{/if}

		{#if $weatherAiLayers.mslp}
			<p class="px-1 text-[11px] text-white/55">
				Isobares tous les 4 hPa (trait renforcé tous les 20 hPa).
			</p>
		{/if}

		{#if $weatherAiLayers.tracks}
			<section class="flex flex-col gap-1.5 px-1">
				<h3 class="text-xs font-semibold text-white/80">Cyclones suivis</h3>
				{#each storms.declared as s (s.label)}
					<div class="flex items-center justify-between text-xs tabular-nums">
						<span class="font-medium">{s.label}</span>
						<span class="text-white/60">
							{#if s.now}{Math.round(s.now.mslpHpa)} hPa · {Math.round(msToKmh(s.now.vmaxMs))} km/h{:else}hors
								suivi à cette échéance{/if}
						</span>
					</div>
				{:else}
					<p class="text-xs text-white/50">Aucun cyclone déclaré dans ce run.</p>
				{/each}
				<p class="text-[11px] leading-snug text-white/55">
					<span
						class="mr-1 inline-block size-2.5 rounded-full border border-violet-300 bg-violet-300/25"
					></span>
					{storms.candidates} zone(s) à surveiller : candidats de cyclogenèse détectés par le modèle,
					sans système réel associé. Ce ne sont pas des cyclones.
				</p>
				<div class="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-white/55 tabular-nums">
					{#each WIND_CLASSES as c, k (c.minMs)}
						<span class="inline-flex items-center gap-1"
							><span class="inline-block size-2 rounded-full" style="background: {c.color}"></span>
							{k === 0
								? `< ${Math.round(msToKmh(WIND_CLASSES[1].minMs))}`
								: `≥ ${Math.round(msToKmh(c.minMs))}`} km/h</span
						>
					{/each}
				</div>
			</section>
		{/if}

		{#if $weatherAiLayers.cones && conesOffered($weatherAiRun)}
			<section class="flex flex-col gap-1 px-1">
				<h3 class="text-xs font-semibold text-white/80">Cônes d'incertitude</h3>
				{#if $weatherAiCones?.doc}
					<p class="text-[11px] font-medium text-amber-100">{CONES_MENTION}</p>
					<p class="text-[11px] text-white/55">
						Zone claire : 90 % · zone soutenue : 68 %. Enveloppe coupée là où le cône est
						indisponible ; hémisphère sud : pas de cône au-delà de +24 h.
					</p>
				{:else if $weatherAiCones?.message}
					<p class="text-[11px] text-white/55">Cônes non affichés : {$weatherAiCones.message}.</p>
				{/if}
			</section>
		{/if}

		<details class="rounded-xl bg-white/[0.04] px-3 py-2">
			<summary class="cursor-pointer text-xs font-semibold text-white/80"
				>Run, sources et licence</summary
			>
			<dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-white/65">
				<dt class="text-white/45">Run</dt>
				<dd class="font-mono break-all">{$weatherAiRun.runId}</dd>
				<dt class="text-white/45">Init.</dt>
				<dd>{$weatherAiRun.initTime ? formatUtc($weatherAiRun.initTime) : 'inconnue'}</dd>
				<dt class="text-white/45">Publié</dt>
				<dd>{formatUtc($weatherAiRun.publishedAt)}</dd>
			</dl>
			<div class="mt-2"><WeatherAiMentions /></div>
		</details>
	{/if}
</div>
