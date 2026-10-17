<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';

	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Cloud from '@lucide/svelte/icons/cloud';
	import CloudRain from '@lucide/svelte/icons/cloud-rain';
	import Gauge from '@lucide/svelte/icons/gauge';
	import Layers from '@lucide/svelte/icons/layers';
	import Search from '@lucide/svelte/icons/search';
	import Thermometer from '@lucide/svelte/icons/thermometer';
	import Wind from '@lucide/svelte/icons/wind';
	import X from '@lucide/svelte/icons/x';
	import {
		LEVEL_UNIT_REGEX,
		getColorScale,
		levelGroupVariables,
		variableOptions
	} from '@openmeteo/weather-map-layer';
	import { mode } from 'mode-watcher';

	import { customColorScales, omProtocolSettings } from '$lib/stores/om-protocol-settings';
	import { desktop } from '$lib/stores/preferences';
	import { metaJson } from '$lib/stores/time';
	import { getDisplayUnit, unitPreferences } from '$lib/stores/units';
	import {
		level,
		levelGroupSelected,
		selectedVariable,
		unit,
		variable
	} from '$lib/stores/variables';

	import { localizeVariableOption, translateVariableLabel } from '$lib/i18n/variables-fr';
	import {
		buildLevelGroups,
		buildVariableList,
		groupVariablesByCategory,
		searchVariables,
		shortLevelLabel
	} from '$lib/layer-list';
	import { pickDefaultLevel } from '$lib/level-groups';

	const ICONS = {
		temperature: Thermometer,
		precipitation: CloudRain,
		wind: Wind,
		clouds: Cloud,
		pressure: Gauge,
		other: Layers
	} as const;

	const grouped = $derived(
		$metaJson ? groupVariablesByCategory(buildVariableList($metaJson.variables)) : []
	);
	// Recherche : à plat sur toutes les familles (les experts savent ce qu'ils
	// cherchent, les amateurs tapent « vent » ou « neige »).
	let query = $state('');
	const results = $derived(
		query.trim()
			? grouped.flatMap(({ cat, items }) =>
					searchVariables(items, query, (v) => translateVariableLabel(optionFor(v).label)).map(
						(item) => ({ cat, item })
					)
				)
			: []
	);

	function optionFor(value: string) {
		return variableOptions.find((o) => o.value === value) ?? { value, label: value };
	}

	const levelGroups = $derived($metaJson ? buildLevelGroups($metaJson.variables) : {});

	// Unité affichée à droite de chaque ligne de variable : même dérivation que
	// context-strip.svelte/scale.svelte (échelle de couleur → préférence d'unité
	// de l'utilisateur). Retourne '' pour les variables sans unité pertinente
	// (catégorielles, directions…) afin que le rendu l'omette proprement.
	const isDark = $derived(mode.current === 'dark');
	function unitFor(value: string): string {
		const base = getColorScale(value, isDark, $omProtocolSettings.colorScales);
		const scale = $customColorScales[value] ?? base;
		return getDisplayUnit(scale.unit, $unitPreferences, value);
	}

	const activeValue = $derived($levelGroupSelected?.value ?? $selectedVariable?.value);
	// Libellé de la variable sélectionnée, affiché en sous-titre quand sa famille
	// est repliée (on garde toujours la sélection courante sous les yeux).
	const activeLabel = $derived(
		$selectedVariable ? translateVariableLabel($selectedVariable.label) : ''
	);
	// Clé de la famille contenant la variable active (fallback : première famille).
	const activeCategory = $derived(
		grouped.find(({ items }) => items.includes(activeValue as string))?.cat.key ??
			grouped[0]?.cat.key ??
			''
	);

	// Accordéon à une seule famille ouverte. `$derived` inscriptible : par défaut
	// la famille active (chargement initial + deep-link), réassignable au clic pour
	// ouvrir/replier, et réinitialisé automatiquement quand `activeCategory` change.
	let openKey: string = $derived(activeCategory);

	function toggleCategory(key: string) {
		openKey = openKey === key ? '' : key;
	}

	// Durées d'accordéon : entrée un peu plus lente que la sortie (« exit faster
	// than enter »), et 0 ms si l'utilisateur a demandé moins d'animations.
	const enterMs = $derived(prefersReducedMotion.current ? 0 : 200);
	const exitMs = $derived(prefersReducedMotion.current ? 0 : 140);

	// Sélectionne une ligne : groupe de niveaux → niveau par défaut (2 m > 10 m >
	// le plus bas), variable simple → sélection directe. Même logique que
	// l'ancien variable-tabs.
	function selectRow(value: string) {
		const option = optionFor(value);
		if (levelGroupVariables.includes(value)) {
			$levelGroupSelected = localizeVariableOption(option);
			const levels = levelGroups[value];
			$variable = (levels && pickDefaultLevel(levels)) ?? value;
		} else {
			$levelGroupSelected = undefined;
			$variable = value;
		}
	}
</script>

{#snippet levelChips(item: string)}
	<!-- Niveaux de la variable active : puces compactes (2 m, 850 hPa…), hauteurs
	     et niveaux de pression séparés quand la variable a les deux. -->
	{@const options = levelGroups[item].filter(
		({ value }) => !value.includes('v_component') && !value.includes('_direction')
	)}
	{@const pressure = options.filter((o) => o.value.match(LEVEL_UNIT_REGEX)?.groups?.unit === 'hPa')}
	{@const heights = options.filter((o) => !pressure.includes(o))}
	<div
		role="radiogroup"
		aria-label="Niveau"
		class="flex flex-col gap-2 border-t border-white/[0.06] bg-white/[0.02] px-3 py-2"
	>
		{#each [{ title: 'Hauteur', list: heights }, { title: 'Pression', list: pressure }] as row (row.title)}
			{#if row.list.length}
				<div>
					{#if heights.length && pressure.length}
						<div class="mb-1 text-[10px] font-medium tracking-wide text-white/40 uppercase">
							{row.title}
						</div>
					{/if}
					<div class="flex flex-wrap gap-1">
						{#each row.list as { value, label } (value)}
							{@const groups = value.match(LEVEL_UNIT_REGEX)?.groups}
							{@const checked = groups?.level === $level && groups?.unit === $unit}
							<button
								type="button"
								role="radio"
								aria-checked={checked}
								title={translateVariableLabel(label)}
								onclick={() => ($variable = value)}
								class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 inline-flex h-8 cursor-pointer items-center rounded-md px-2 text-xs tabular-nums transition-colors md:h-7 {checked
									? 'bg-sky-400/20 text-sky-200 ring-1 ring-sky-400/50 ring-inset'
									: 'bg-white/[0.05] text-white/75 hover:bg-white/10 hover:text-white'}"
							>
								{shortLevelLabel(value, translateVariableLabel(label))}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		{/each}
	</div>
{/snippet}

{#snippet variableRow(item: string, Icon?: (typeof ICONS)[keyof typeof ICONS])}
	{@const label = translateVariableLabel(optionFor(item).label)}
	{@const active = activeValue === item}
	{@const u = unitFor(item)}
	<button
		type="button"
		onclick={() => selectRow(item)}
		title={label}
		aria-pressed={active}
		class="hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 relative flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors md:min-h-9 {active
			? 'bg-sky-400/[0.08] text-sky-300'
			: 'text-white'}"
	>
		{#if active}
			<span class="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-sky-300"></span>
		{/if}
		{#if Icon}
			<Icon class="size-4 shrink-0 {active ? '' : 'text-white/45'}" aria-hidden="true" />
		{/if}
		<span class="flex-1 truncate">{label}</span>
		{#if u}
			<span class="shrink-0 text-[11px] tabular-nums {active ? 'text-sky-300/70' : 'text-white/45'}"
				>{u}</span
			>
		{/if}
	</button>
	{#if active && levelGroups[item]?.length}
		{@render levelChips(item)}
	{/if}
{/snippet}

{#if $metaJson}
	<div class="flex flex-col gap-2">
		<!-- Recherche de variable ( « / » pour y aller au clavier sur desktop) -->
		<div class="relative">
			<Search
				class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-white/40"
				aria-hidden="true"
			/>
			<input
				id="variable-search"
				type="search"
				bind:value={query}
				onkeydown={(e) => {
					if (e.key === 'Escape' && query) {
						e.stopPropagation();
						query = '';
					} else if (e.key === 'Enter' && results.length) {
						selectRow(results[0].item);
					}
				}}
				placeholder="Rechercher une variable…"
				aria-label="Rechercher une variable"
				autocomplete="off"
				class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/50 h-10 w-full rounded-lg border border-white/10 bg-white/[0.05] pr-9 pl-8 text-sm text-white placeholder:text-white/40 md:h-9 [&::-webkit-search-cancel-button]:appearance-none"
			/>
			{#if query}
				<button
					type="button"
					onclick={() => (query = '')}
					aria-label="Effacer la recherche"
					class="hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 absolute top-1/2 right-1.5 inline-flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-white/50 hover:text-white"
				>
					<X class="size-3.5" aria-hidden="true" />
				</button>
			{:else if desktop.current}
				<kbd
					class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-white/15 px-1.5 font-sans text-[10px] text-white/40"
					aria-hidden="true">/</kbd
				>
			{/if}
		</div>

		{#if query.trim()}
			{#if results.length}
				<div
					class="overflow-hidden rounded-xl bg-white/[0.04] [&>*+*]:border-t [&>*+*]:border-white/[0.06]"
				>
					{#each results as { cat, item } (item)}
						{@render variableRow(item, ICONS[cat.key])}
					{/each}
				</div>
			{:else}
				<p class="px-2 py-6 text-center text-sm text-white/45">
					Aucune variable pour « {query.trim()} » sur ce modèle.
				</p>
			{/if}
		{:else}
			<div class="flex flex-col gap-0.5">
				{#each grouped as { cat, items } (cat.key)}
					{@const Icon = ICONS[cat.key]}
					{@const open = openKey === cat.key}
					{@const hasActive = items.includes(activeValue as string)}
					<div>
						<!-- En-tête de famille : ouvre/replie l'accordéon -->
						<button
							type="button"
							onclick={() => toggleCategory(cat.key)}
							aria-expanded={open}
							aria-controls="layer-cat-{cat.key}"
							class="hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 text-left transition-colors md:min-h-10"
						>
							<span
								class="flex size-7 shrink-0 items-center justify-center rounded-md {hasActive
									? 'bg-sky-400/15 text-sky-300'
									: 'bg-white/[0.05] text-white/60'}"
							>
								<Icon class="size-4" aria-hidden="true" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm font-medium text-white">{cat.label}</span>
								{#if !open && hasActive}
									<span title={activeLabel} class="block truncate text-[11px] text-sky-300"
										>{activeLabel}</span
									>
								{/if}
							</span>
							<span class="shrink-0 text-[11px] text-white/35 tabular-nums">{items.length}</span>
							<ChevronDown
								class="size-4 shrink-0 text-white/40 transition-transform duration-200 motion-reduce:transition-none {open
									? ''
									: '-rotate-90'}"
								aria-hidden="true"
							/>
						</button>

						{#if open}
							<div
								id="layer-cat-{cat.key}"
								in:slide={{ duration: enterMs, easing: cubicOut }}
								out:slide={{ duration: exitMs, easing: cubicOut }}
								class="mt-1 mb-1.5 overflow-hidden rounded-xl bg-white/[0.04] [&>*+*]:border-t [&>*+*]:border-white/[0.06]"
							>
								{#each items as item (item)}
									{@render variableRow(item)}
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}
