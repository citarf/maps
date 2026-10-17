<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';

	import LayersIcon from '@lucide/svelte/icons/layers';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SaveIcon from '@lucide/svelte/icons/save';
	import WavesIcon from '@lucide/svelte/icons/waves';
	import WindIcon from '@lucide/svelte/icons/wind';
	import XIcon from '@lucide/svelte/icons/x';
	import { variableHasDirections } from '@openmeteo/weather-map-layer';

	import { overlays } from '$lib/stores/composition';
	import { metaJson } from '$lib/stores/time';
	import { variable } from '$lib/stores/variables';

	import { isSourceAvailable } from '$lib/composition';
	import {
		clearOverlays,
		removeOverlay,
		saveCurrentComposition,
		updateOverlay
	} from '$lib/composition-actions';
	import { parseInterval, stepInterval, variableLabel } from '$lib/composition-list';

	import OverlayVariablePicker from './overlay-variable-picker.svelte';

	import type { ChartSource } from '$lib/chart-types';

	let pickerOpen = $state(false);
	let saveName = $state('');

	const canSave = $derived(saveName.trim() !== '' && $overlays.length > 0);

	const enterMs = $derived(prefersReducedMotion.current ? 0 : 200);
	const exitMs = $derived(prefersReducedMotion.current ? 0 : 140);

	const toggle = (index: number, source: ChartSource, key: 'raster' | 'contours' | 'arrows') =>
		updateOverlay(index, { [key]: !source[key] });

	const submitSave = () => {
		if (!canSave) return;
		saveCurrentComposition(saveName);
		saveName = '';
	};

	const toggleClass = (on: boolean | undefined): string =>
		on ? 'bg-sky-400/15 text-sky-300' : 'text-white/55 hover:bg-white/[0.05] hover:text-white';

	const chipClass =
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 inline-flex min-h-11 items-center gap-1 rounded-md px-1.5 text-xs transition-colors md:min-h-9';

	const actionClass =
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm transition-colors md:min-h-9';
</script>

<div class="flex flex-col gap-2">
	<div
		class="overflow-hidden rounded-xl bg-white/[0.04] [&>*+*]:border-t [&>*+*]:border-white/[0.06]"
	>
		<!-- Fond : la variable principale, choisie dans « Calques » -->
		<div class="flex min-h-11 items-center gap-2 px-3 py-2 text-sm md:min-h-9">
			<span class="min-w-0 flex-1 truncate text-white" title={variableLabel($variable)}
				>{variableLabel($variable)}</span
			>
			<span class="shrink-0 text-[11px] text-white/45">fond</span>
		</div>

		{#each $overlays as source, i (source.variable)}
			{@const available = isSourceAvailable(source, $metaJson?.variables)}
			{@const arrowsSupported = variableHasDirections(source.variable)}
			<div
				class="flex flex-col gap-1 px-3 py-2 text-sm {available ? '' : 'opacity-40'}"
				title={available ? undefined : 'Indisponible sur ce modèle'}
			>
				<div class="flex items-center gap-2">
					<span class="min-w-0 flex-1 truncate text-white" title={variableLabel(source.variable)}
						>{variableLabel(source.variable)}</span
					>
					{#if source.contours}
						<input
							type="number"
							step="any"
							min="0.1"
							inputmode="decimal"
							placeholder="auto"
							title="Intervalle des isolignes (vide = paliers de l'échelle)"
							aria-label="Intervalle des isolignes"
							value={source.contourInterval ?? ''}
							onkeydown={(e) => {
								if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
								e.preventDefault();
								updateOverlay(i, {
									contourInterval: stepInterval(source.contourInterval ?? 2, e.key === 'ArrowUp')
								});
							}}
							onchange={(e) =>
								updateOverlay(i, { contourInterval: parseInterval(e.currentTarget.value) })}
							class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 h-8 w-12 shrink-0 rounded-md bg-white/[0.06] px-1 text-center text-xs text-white tabular-nums placeholder:text-white/35 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
						/>
					{/if}
					<button
						type="button"
						onclick={() => removeOverlay(i)}
						title="Retirer"
						aria-label="Retirer {variableLabel(source.variable)}"
						class="hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 -mr-1.5 inline-flex min-h-11 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-white/45 transition-colors hover:text-white md:min-h-9 md:w-8"
					>
						<XIcon class="size-3.5" aria-hidden="true" />
					</button>
				</div>
				<div class="flex flex-wrap items-center gap-1">
					<button
						type="button"
						onclick={() => toggle(i, source, 'raster')}
						aria-pressed={!!source.raster}
						class="{chipClass} cursor-pointer {toggleClass(source.raster)}"
					>
						<LayersIcon class="size-3.5" aria-hidden="true" />
						Aplat
					</button>
					<button
						type="button"
						onclick={() => toggle(i, source, 'contours')}
						aria-pressed={!!source.contours}
						class="{chipClass} cursor-pointer {toggleClass(source.contours)}"
					>
						<WavesIcon class="size-3.5" aria-hidden="true" />
						Isolignes
					</button>
					<button
						type="button"
						onclick={() => toggle(i, source, 'arrows')}
						aria-pressed={!!source.arrows}
						disabled={!arrowsSupported}
						title={arrowsSupported ? undefined : 'Pas de direction pour cette variable'}
						class="{chipClass} {arrowsSupported
							? 'cursor-pointer ' + toggleClass(source.arrows)
							: 'cursor-not-allowed text-white/25'}"
					>
						<WindIcon class="size-3.5" aria-hidden="true" />
						Flèches
					</button>
				</div>
			</div>
		{/each}
	</div>

	<button
		type="button"
		onclick={() => (pickerOpen = !pickerOpen)}
		aria-expanded={pickerOpen}
		class="{actionClass} w-full cursor-pointer bg-white/[0.06] hover:bg-white/10 {pickerOpen
			? 'text-sky-300'
			: 'text-white'}"
	>
		<PlusIcon class="size-4" aria-hidden="true" />
		Ajouter une superposition
	</button>
	{#if pickerOpen}
		<div
			in:slide={{ duration: enterMs, easing: cubicOut }}
			out:slide={{ duration: exitMs, easing: cubicOut }}
		>
			<OverlayVariablePicker onPicked={() => (pickerOpen = false)} />
		</div>
	{/if}

	<form
		class="flex items-center gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			submitSave();
		}}
	>
		<input
			type="text"
			placeholder="Nom"
			aria-label="Nom"
			bind:value={saveName}
			class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 min-h-11 min-w-0 flex-1 rounded-lg bg-white/[0.06] px-3 text-sm text-white placeholder:text-white/35 md:min-h-9"
		/>
		<button
			type="submit"
			disabled={!canSave}
			class="{actionClass} shrink-0 bg-white/[0.06] text-white {canSave
				? 'cursor-pointer hover:bg-white/10'
				: 'cursor-not-allowed opacity-40'}"
		>
			<SaveIcon class="size-4" aria-hidden="true" />
			Enregistrer
		</button>
	</form>

	{#if $overlays.length}
		<button
			type="button"
			onclick={clearOverlays}
			class="{actionClass} w-full cursor-pointer text-white/55 hover:bg-white/[0.05] hover:text-white"
		>
			Tout retirer
		</button>
	{/if}
</div>
