<script module lang="ts">
	import { persisted } from 'svelte-persisted-store';

	// Groupes dépliés, persistés d'une session à l'autre (comme upstream)
	const openGroups = persisted<Record<string, boolean>>('composition-groups-open', {});
</script>

<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';

	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import XIcon from '@lucide/svelte/icons/x';

	import { activeComposition, activePresetId, savedCompositions } from '$lib/stores/composition';
	import { metaJson } from '$lib/stores/time';

	import { chartPresets } from '$lib/chart-presets';
	import { compositionsEqual } from '$lib/composition';
	import {
		applyPreset,
		applySavedComposition,
		deleteSavedComposition
	} from '$lib/composition-actions';
	import { groupPresets, savedCompositionEntries, variableLabel } from '$lib/composition-list';

	const MY_GROUP = 'Mes compositions';

	const presetGroups = $derived(groupPresets(chartPresets, $metaJson?.variables));
	const savedEntries = $derived(
		savedCompositionEntries($savedCompositions.compositions, $metaJson?.variables)
	);

	const enterMs = $derived(prefersReducedMotion.current ? 0 : 200);
	const exitMs = $derived(prefersReducedMotion.current ? 0 : 140);

	// Le défaut compte : un groupe ouvert par défaut (« Mes compositions »)
	// demanderait sinon deux clics pour le premier repli
	const toggleGroup = (name: string, defaultOpen = false) => {
		openGroups.update((state) => ({ ...state, [name]: !(state[name] ?? defaultOpen) }));
	};

	const countLabel = (available: number, total: number): string =>
		available === total ? String(total) : `${available}/${total}`;
</script>

{#snippet groupHeader(
	name: string,
	open: boolean,
	enabled: boolean,
	active: boolean,
	count: string,
	toggle: () => void
)}
	<button
		type="button"
		onclick={toggle}
		disabled={!enabled}
		aria-expanded={open}
		title={enabled ? undefined : 'Aucune composition disponible sur ce modèle'}
		class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors md:min-h-9 {enabled
			? 'hover:bg-white/[0.05] cursor-pointer'
			: 'cursor-not-allowed opacity-40'}"
	>
		<span
			class="min-w-0 flex-1 truncate text-sm font-medium {active ? 'text-sky-300' : 'text-white'}"
			>{name}</span
		>
		{#if !open && active}
			<CheckIcon class="size-3.5 shrink-0 text-sky-300" aria-hidden="true" />
		{/if}
		<span class="shrink-0 text-[11px] text-white/45 tabular-nums">{count}</span>
		<ChevronDownIcon
			class="size-4 shrink-0 text-white/40 transition-transform duration-200 motion-reduce:transition-none {open
				? ''
				: '-rotate-90'}"
			aria-hidden="true"
		/>
	</button>
{/snippet}

<div class="flex flex-col gap-1">
	{#each presetGroups as { group, items } (group)}
		{@const availableCount = items.filter((entry) => entry.available).length}
		{@const enabled = availableCount > 0}
		{@const open = enabled && ($openGroups[group] ?? false)}
		{@const active = items.some(({ preset }) => $activePresetId === preset.id)}
		<div>
			{@render groupHeader(
				group,
				open,
				enabled,
				active,
				countLabel(availableCount, items.length),
				() => toggleGroup(group)
			)}
			{#if open}
				<div
					in:slide={{ duration: enterMs, easing: cubicOut }}
					out:slide={{ duration: exitMs, easing: cubicOut }}
					class="mt-1 overflow-hidden rounded-xl bg-white/[0.04] [&>*+*]:border-t [&>*+*]:border-white/[0.06]"
				>
					{#each items as { preset, available } (preset.id)}
						{@const selected = $activePresetId === preset.id}
						<button
							type="button"
							onclick={() => applyPreset(preset.id)}
							disabled={!available}
							aria-pressed={selected}
							title={available ? preset.label : 'Variables indisponibles sur ce modèle'}
							class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors md:min-h-9 {available
								? 'hover:bg-white/[0.05] cursor-pointer'
								: 'cursor-not-allowed opacity-40'} {selected ? 'text-sky-300' : 'text-white'}"
						>
							<span class="min-w-0 flex-1">
								<span class="block truncate">{preset.label}</span>
								{#if preset.description}
									<span
										class="block truncate text-[11px] {selected
											? 'text-sky-300/70'
											: 'text-white/45'}">{preset.description}</span
									>
								{/if}
							</span>
							<CheckIcon
								class="size-4 shrink-0 {selected ? 'text-sky-300' : 'text-transparent'}"
								aria-hidden="true"
							/>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/each}

	{#if savedEntries.length}
		{@const open = $openGroups[MY_GROUP] ?? true}
		{@const availableCount = savedEntries.filter((entry) => entry.available).length}
		{@const active = savedEntries.some(({ saved }) =>
			compositionsEqual($activeComposition, saved.composition)
		)}
		<div>
			{@render groupHeader(
				MY_GROUP,
				open,
				true,
				active,
				countLabel(availableCount, savedEntries.length),
				() => toggleGroup(MY_GROUP, true)
			)}
			{#if open}
				<div
					in:slide={{ duration: enterMs, easing: cubicOut }}
					out:slide={{ duration: exitMs, easing: cubicOut }}
					class="mt-1 overflow-hidden rounded-xl bg-white/[0.04] [&>*+*]:border-t [&>*+*]:border-white/[0.06]"
				>
					{#each savedEntries as { saved, available } (saved.id)}
						{@const selected = compositionsEqual($activeComposition, saved.composition)}
						<div class="flex items-center {selected ? 'text-sky-300' : 'text-white'}">
							<button
								type="button"
								onclick={() => applySavedComposition(saved.id)}
								disabled={!available}
								aria-pressed={selected}
								title={available ? saved.name : 'Variables indisponibles sur ce modèle'}
								class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 flex min-h-11 min-w-0 flex-1 items-center gap-2 py-2 pl-3 text-left text-sm transition-colors md:min-h-9 {available
									? 'hover:bg-white/[0.05] cursor-pointer'
									: 'cursor-not-allowed opacity-40'}"
							>
								<span class="min-w-0 flex-1">
									<span class="block truncate">{saved.name}</span>
									<span
										class="block truncate text-[11px] {selected
											? 'text-sky-300/70'
											: 'text-white/45'}"
										>{[
											saved.composition.variable,
											...saved.composition.overlays.map((o) => o.variable)
										]
											.map(variableLabel)
											.join(' + ')}</span
									>
								</span>
								{#if selected}
									<CheckIcon class="size-4 shrink-0" aria-hidden="true" />
								{/if}
							</button>
							<button
								type="button"
								onclick={() => deleteSavedComposition(saved.id)}
								title="Supprimer"
								aria-label="Supprimer {saved.name}"
								class="hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 inline-flex min-h-11 w-10 shrink-0 cursor-pointer items-center justify-center text-white/45 transition-colors hover:text-white md:min-h-9 md:w-8"
							>
								<XIcon class="size-3.5" aria-hidden="true" />
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
