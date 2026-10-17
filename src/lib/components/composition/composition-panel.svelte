<script lang="ts">
	import CompositionEditor from './composition-editor.svelte';
	import PresetList from './preset-list.svelte';
</script>

<!-- Panneau « Compositions » : compositions toutes faites / enregistrées, puis
     la composition actuelle (fond + superpositions). Portage des « Combined
     charts » et « Current chart » d'open-meteo/maps. -->
<div class="flex flex-col gap-3">
	<PresetList />
	<div class="flex flex-col gap-1.5">
		<div class="px-2 text-[11px] font-semibold tracking-wide text-white/45 uppercase">
			Composition actuelle
		</div>
		<CompositionEditor />
	</div>
</div>
