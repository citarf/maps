<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';

	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import SearchIcon from '@lucide/svelte/icons/search';

	import { overlays } from '$lib/stores/composition';
	import { desktop } from '$lib/stores/preferences';
	import { metaJson } from '$lib/stores/time';
	import { variable } from '$lib/stores/variables';

	import { addOverlay, setBaseVariable } from '$lib/composition-actions';
	import { variableLabel } from '$lib/composition-list';
	import { translateVariableLabel } from '$lib/i18n/variables-fr';
	import {
		buildLevelGroups,
		buildVariableList,
		groupVariablesByCategory,
		searchVariables
	} from '$lib/layer-list';

	interface Props {
		/** `overlay` : ajoute une superposition ; `base` : remplace le fond. */
		mode?: 'overlay' | 'base';
		/** Appelé après le choix. */
		onPicked?: () => void;
	}
	let { mode = 'overlay', onPicked }: Props = $props();

	// Mêmes familles et niveaux que le panneau « Calques »
	const grouped = $derived(
		$metaJson ? groupVariablesByCategory(buildVariableList($metaJson.variables)) : []
	);
	const levelGroups = $derived($metaJson ? buildLevelGroups($metaJson.variables) : {});
	// Indisponibles : déjà superposées ; en mode fond, aussi le fond actuel (pas de
	// doublon fond/superposition sur une même variable de niveau).
	const used = $derived(
		new Set([...$overlays.map((o) => o.variable), ...(mode === 'base' ? [$variable] : [])])
	);
	const takenTitle = $derived(mode === 'base' ? 'Déjà affichée' : 'Déjà superposée');

	// Recherche à plat, comme dans « Données » (niveaux inclus dans la recherche)
	let query = $state('');
	const results = $derived.by(() => {
		if (!query.trim()) return [];
		const flat = grouped.flatMap(({ items }) =>
			items.flatMap((item) => {
				const levels = levelsOf(item);
				return levels.length ? levels.map((l) => l.value) : [item];
			})
		);
		return searchVariables(flat, query, variableLabel);
	});

	// Accordéon à une seule famille ouverte, puis une seule variable à niveaux dépliée
	let openCategory = $state('');
	let openItem = $state('');

	const enterMs = $derived(prefersReducedMotion.current ? 0 : 200);
	const exitMs = $derived(prefersReducedMotion.current ? 0 : 140);

	/** Niveaux affichables d'une variable (composantes v et directions exclues, comme « Calques »). */
	const levelsOf = (item: string) =>
		(levelGroups[item] ?? []).filter(
			({ value }) => !value.includes('v_component') && !value.includes('_direction')
		);

	const pick = (value: string) => {
		if (mode === 'base') setBaseVariable(value);
		else addOverlay(value);
		onPicked?.();
	};

	const rowClass =
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors md:min-h-9';
</script>

{#snippet pickButton(value: string, label: string, indent: boolean)}
	{@const taken = used.has(value)}
	<button
		type="button"
		onclick={() => pick(value)}
		disabled={taken}
		title={taken ? takenTitle : undefined}
		class="{rowClass} {indent ? 'pl-8' : ''} {taken
			? 'cursor-not-allowed text-white/35'
			: 'hover:bg-white/[0.05] cursor-pointer text-white/85'}"
	>
		<span class="flex-1 truncate">{label}</span>
	</button>
{/snippet}

{#if $metaJson}
	<div
		class="flex flex-col gap-1"
		role="group"
		aria-label={mode === 'base' ? 'Choisir le fond' : 'Ajouter une superposition'}
	>
		<div class="relative mb-1">
			<SearchIcon
				class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-white/40"
				aria-hidden="true"
			/>
			<input
				type="search"
				bind:value={query}
				{@attach (el) => {
					// Focus direct sur desktop seulement : sur mobile il ferait monter le clavier
					if (desktop.current) el.focus();
				}}
				placeholder={mode === 'base' ? 'Rechercher le fond…' : 'Rechercher une couche…'}
				aria-label="Rechercher une variable"
				autocomplete="off"
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						const first = results.find((v) => !used.has(v));
						if (first) pick(first);
					}
				}}
				class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/50 h-10 w-full rounded-lg border border-white/10 bg-white/[0.05] pr-3 pl-8 text-sm text-white placeholder:text-white/40 md:h-9 [&::-webkit-search-cancel-button]:appearance-none"
			/>
		</div>
		{#if query.trim()}
			{#if results.length}
				<div
					class="overflow-hidden rounded-xl bg-white/[0.04] [&>*+*]:border-t [&>*+*]:border-white/[0.06]"
				>
					{#each results as value (value)}
						{@render pickButton(value, variableLabel(value), false)}
					{/each}
				</div>
			{:else}
				<p class="px-2 py-4 text-center text-sm text-white/45">Aucune variable trouvée.</p>
			{/if}
		{:else}
			{#each grouped as { cat, items } (cat.key)}
				{@const open = openCategory === cat.key}
				<div>
					<button
						type="button"
						onclick={() => (openCategory = open ? '' : cat.key)}
						aria-expanded={open}
						class="hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 text-left transition-colors md:min-h-9"
					>
						<span class="min-w-0 flex-1 truncate text-sm font-medium text-white">{cat.label}</span>
						<ChevronDownIcon
							class="size-4 shrink-0 text-white/40 transition-transform duration-200 motion-reduce:transition-none {open
								? ''
								: '-rotate-90'}"
							aria-hidden="true"
						/>
					</button>
					{#if open}
						<div
							in:slide={{ duration: enterMs, easing: cubicOut }}
							out:slide={{ duration: exitMs, easing: cubicOut }}
							class="mt-1 overflow-hidden rounded-xl bg-white/[0.04] [&>*+*]:border-t [&>*+*]:border-white/[0.06]"
						>
							{#each items as item (item)}
								{@const levels = levelsOf(item)}
								{#if levels.length}
									{@const expanded = openItem === item}
									<button
										type="button"
										onclick={() => (openItem = expanded ? '' : item)}
										aria-expanded={expanded}
										class="{rowClass} hover:bg-white/[0.05] cursor-pointer text-white"
									>
										<span class="flex-1 truncate">{variableLabel(item)}</span>
										<ChevronDownIcon
											class="size-3.5 shrink-0 text-white/40 transition-transform duration-200 motion-reduce:transition-none {expanded
												? ''
												: '-rotate-90'}"
											aria-hidden="true"
										/>
									</button>
									{#if expanded}
										<div class="flex flex-col bg-white/[0.02] py-1">
											{#each levels as { value, label } (value)}
												{@render pickButton(value, translateVariableLabel(label), true)}
											{/each}
										</div>
									{/if}
								{:else}
									{@render pickButton(item, variableLabel(item), false)}
								{/if}
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
{/if}
