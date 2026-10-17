<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';

	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';

	import { overlays } from '$lib/stores/composition';
	import { metaJson } from '$lib/stores/time';

	import { addOverlay } from '$lib/composition-actions';
	import { variableLabel } from '$lib/composition-list';
	import { translateVariableLabel } from '$lib/i18n/variables-fr';
	import { buildLevelGroups, buildVariableList, groupVariablesByCategory } from '$lib/layer-list';

	interface Props {
		/** Appelé après l'ajout d'une superposition. */
		onPicked?: () => void;
	}
	let { onPicked }: Props = $props();

	// Mêmes familles et niveaux que le panneau « Calques »
	const grouped = $derived(
		$metaJson ? groupVariablesByCategory(buildVariableList($metaJson.variables)) : []
	);
	const levelGroups = $derived($metaJson ? buildLevelGroups($metaJson.variables) : {});
	const used = $derived(new Set($overlays.map((o) => o.variable)));

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
		addOverlay(value);
		onPicked?.();
	};

	const rowClass =
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors md:min-h-9';
</script>

{#if $metaJson}
	<div class="flex flex-col gap-1" role="group" aria-label="Ajouter une superposition">
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
											{@const taken = used.has(value)}
											<button
												type="button"
												onclick={() => pick(value)}
												disabled={taken}
												title={taken ? 'Déjà superposée' : undefined}
												class="{rowClass} pl-8 {taken
													? 'cursor-not-allowed text-white/35'
													: 'hover:bg-white/[0.05] cursor-pointer text-white/80'}"
											>
												{translateVariableLabel(label)}
											</button>
										{/each}
									</div>
								{/if}
							{:else}
								{@const taken = used.has(item)}
								<button
									type="button"
									onclick={() => pick(item)}
									disabled={taken}
									title={taken ? 'Déjà superposée' : undefined}
									class="{rowClass} {taken
										? 'cursor-not-allowed text-white/35'
										: 'hover:bg-white/[0.05] cursor-pointer text-white'}"
								>
									<span class="flex-1 truncate">{variableLabel(item)}</span>
								</button>
							{/if}
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
