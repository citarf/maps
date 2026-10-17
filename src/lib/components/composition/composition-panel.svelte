<script lang="ts">
	import CompositionEditor from './composition-editor.svelte';
	import PresetList from './preset-list.svelte';
</script>

<!-- Panneau « Compositions » : la composition actuelle (fond + superpositions),
     puis les compositions toutes faites / enregistrées. Portage des « Combined
     charts » et « Current chart » d'open-meteo/maps. Titres alignés sur ceux de
     l'onglet « Carte » (display-section). -->
<div class="flex flex-col gap-4">
	<!-- Construction d'abord : on part du fond affiché et on empile les couches ;
	     les modèles servent de raccourcis, pas de passage obligé. -->
	<section class="flex flex-col gap-1.5">
		<div class="px-1">
			<h3 class="text-xs font-semibold text-white/80">Votre composition</h3>
			<p class="text-[11px] text-white/40 [@media(max-height:820px)]:hidden">
				Un fond, puis des couches par-dessus
			</p>
		</div>
		<CompositionEditor />
	</section>
	<section class="flex flex-col gap-1.5">
		<div class="px-1">
			<h3 class="text-xs font-semibold text-white/80">Partir d'un modèle</h3>
			<p class="text-[11px] text-white/40 [@media(max-height:820px)]:hidden">
				Remplace la composition actuelle
			</p>
		</div>
		<PresetList />
	</section>
</div>
