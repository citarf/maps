<script lang="ts">
	import BlendIcon from '@lucide/svelte/icons/blend';

	import { opacity } from '$lib/stores/preferences';

	import { Label } from '$lib/components/ui/label';

	import { reloadStyles } from '$lib/map-controls';
</script>

<div class="flex items-center gap-3 px-3 py-2.5">
	<BlendIcon class="size-[18px] shrink-0" aria-hidden="true" />
	<Label class="shrink-0 cursor-pointer text-sm" for="raster-opacity">Opacité</Label>
	<input
		id="raster-opacity"
		class="min-w-0 flex-1 delay-75 duration-200"
		type="range"
		min="0"
		max="100"
		onchange={reloadStyles}
		bind:value={$opacity}
	/>
	<span class="w-9 shrink-0 text-right text-sm tabular-nums">{$opacity}%</span>
</div>
