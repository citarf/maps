// Commutation atomique des couches Weather AI sur la carte (même principe que
// `slot-manager.ts`) : chaque état à afficher est monté dans un slot neuf, à
// opacité nulle, avec TOUTES ses sources ; on attend que chacune soit chargée
// (une source `image` ou `geojson` se charge de façon asynchrone), puis on
// rend le slot visible et on retire l'ancien dans le même tick. On n'affiche
// donc jamais des isobares d'un run avec les trajectoires ou l'image d'un autre.
// Un commit dépassé par un plus récent est abandonné, à toute étape.

export interface SlotAdapter<P> {
	/** Monte les sources et couches du slot, invisibles. */
	mount(slot: string, plan: P): void;
	/** Toutes les sources du slot sont chargées. */
	loaded(slot: string): boolean;
	/** Rend le slot visible (opacités cibles). */
	show(slot: string): void;
	/** Retire couches et sources du slot (idempotent). */
	unmount(slot: string): void;
	/** Le slot existe encore sur la carte (un `setStyle` purge tout). */
	exists(slot: string): boolean;
	/** Abonnement aux évènements de chargement de la carte. */
	onChange(cb: () => void): () => void;
}

/**
 * `timeout` : le nouvel état ne s'est pas chargé dans le délai ; il est retiré
 * et l'état précédent reste affiché (l'appelant signale l'échec et réessaie).
 */
export type CommitResult = 'shown' | 'cleared' | 'stale' | 'unchanged' | 'timeout';

export interface LayerSwitcher<P> {
	/**
	 * Prépare (asynchrone, hors écran) puis affiche l'état `signature`. `prepare`
	 * renvoie `null` pour tout effacer.
	 */
	commit(signature: string, prepare: () => Promise<P | null>): Promise<CommitResult>;
	/** Slot affiché, pour l'infobulle. */
	readonly activeSlot: string | null;
}

export function createLayerSwitcher<P>(
	adapter: SlotAdapter<P>,
	{ timeoutMs = 15_000 } = {}
): LayerSwitcher<P> {
	let seq = 0;
	let counter = 0;
	let active: { slot: string; signature: string } | null = null;
	let pending: string | null = null;
	let requested: string | null = null;

	const waitLoaded = (slot: string, my: number) =>
		new Promise<'loaded' | 'stale' | 'timeout'>((resolve) => {
			let done = false;
			let off = () => {};
			const finish = (outcome: 'loaded' | 'stale' | 'timeout') => {
				if (done) return;
				done = true;
				clearTimeout(timer);
				off();
				resolve(outcome);
			};
			const check = () => {
				if (my !== seq) finish('stale');
				else if (adapter.loaded(slot)) finish('loaded');
			};
			// Garde : un slot qui ne se charge jamais n'est PAS affiché incomplet.
			const timer = setTimeout(() => finish('timeout'), timeoutMs);
			off = adapter.onChange(check);
			check();
		});

	return {
		get activeSlot() {
			return active && adapter.exists(active.slot) ? active.slot : null;
		},
		async commit(signature, prepare) {
			// Un re-style a purgé les slots : rien n'est plus affiché.
			if (active && !adapter.exists(active.slot)) active = null;
			// Déjà affiché et aucun commit plus récent en vol : rien à faire.
			if (active?.signature === signature && requested === signature) return 'unchanged';

			requested = signature;
			const my = ++seq;
			const plan = await prepare();
			if (my !== seq) return 'stale';

			if (pending) {
				adapter.unmount(pending);
				pending = null;
			}
			if (plan === null) {
				if (active) adapter.unmount(active.slot);
				active = null;
				return 'cleared';
			}

			const slot = `s${++counter}`;
			pending = slot;
			adapter.mount(slot, plan);
			const outcome = await waitLoaded(slot, my);
			if (outcome === 'timeout' && my === seq) {
				// Incomplet : on le retire et on garde l'état affiché tel quel.
				adapter.unmount(slot);
				pending = null;
				requested = active?.signature ?? null;
				return 'timeout';
			}
			if (my !== seq) {
				// Dépassé : le commit plus récent a déjà retiré ce slot, ou le retirera.
				if (pending === slot) {
					adapter.unmount(slot);
					pending = null;
				}
				return 'stale';
			}

			adapter.show(slot);
			if (active) adapter.unmount(active.slot);
			active = { slot, signature };
			pending = null;
			return 'shown';
		}
	};
}
