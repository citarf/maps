<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { get } from 'svelte/store';

	import { toast } from 'svelte-sonner';

	import { browser } from '$app/environment';

	import { timeSelectorActions } from '$lib/stores/keyboard';
	import { popup, popupMode } from '$lib/stores/map';
	import { desktop, helpOpen, sidebarCollapsed, sidebarTab } from '$lib/stores/preferences';
	import { domainSelectionOpen } from '$lib/stores/variables';

	import { switchPopupMode } from '$lib/popup';

	const keyDownEvent = (event: KeyboardEvent) => {
		// Ignore shortcuts when focus is inside an editable element, except for Escape
		const target = event.target as HTMLElement;
		const isEditable =
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement ||
			target.isContentEditable;
		if (isEditable && event.key !== 'Escape') return;

		// Help Dialog and Popup actions
		if (event.key === 'h') {
			helpOpen.set(!get(helpOpen));
			return;
		}

		// Recherche de variable : ouvre l'onglet « Données » du panneau et y focalise
		if (event.key === '/' && desktop.current) {
			event.preventDefault();
			sidebarCollapsed.set(false);
			sidebarTab.set('layers');
			tick().then(() => document.getElementById('variable-search')?.focus());
			return;
		}

		if (event.key === 'p') {
			switchPopupMode();
			const mode = get(popupMode);
			toast.info(
				'Mode infobulle : ' +
					(mode ? (mode === 'follow' ? 'Suit la souris' : 'Déplaçable') : 'Désactivé')
			);
			return;
		}

		if (event.key === 'Escape') {
			popupMode.set(null);
			const p = get(popup);
			if (p) p.remove();
			popup.set(undefined);
			toast.dismiss();
			return;
		}

		// Model Selection Navigation
		if (!event.ctrlKey && !get(domainSelectionOpen) && event.key === 'd') {
			// Le sélecteur vit dans l'onglet « Données » : on l'affiche d'abord.
			if (desktop.current) {
				sidebarCollapsed.set(false);
				sidebarTab.set('layers');
			}
			domainSelectionOpen.set(true);
			return;
		}

		// Time Selector Navigation
		const canNavigateTime = !get(domainSelectionOpen);
		if (canNavigateTime) {
			const isTimeAction = [
				'ArrowLeft',
				'ArrowRight',
				'ArrowDown',
				'ArrowUp',
				'c',
				'm',
				'n'
			].includes(event.key);
			if (!isTimeAction) return;

			const { timeNavigationDisabled } = get(timeSelectorActions);

			if (timeNavigationDisabled && event.key !== 'm') return;

			const actions = get(timeSelectorActions);
			if (event.key === 'ArrowLeft')
				(event.ctrlKey ? actions.previousModel : actions.previousHour)?.();
			else if (event.key === 'ArrowRight')
				(event.ctrlKey ? actions.nextModel : actions.nextHour)?.();
			else if (event.key === 'ArrowDown') actions.previousDay?.();
			else if (event.key === 'ArrowUp') actions.nextDay?.();
			else if (event.key === 'c') actions.jumpToCurrentTime?.();
			else if (event.key === 'm') actions.toggleModelRunLock?.();
			else if (event.key === 'n') actions.setLatestModelRun?.();
		}
	};

	onMount(() => {
		if (browser) window.addEventListener('keydown', keyDownEvent);
	});

	onDestroy(() => {
		if (browser) window.removeEventListener('keydown', keyDownEvent);
	});
</script>
