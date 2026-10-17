/**
 * Coordinateur de commit : fade-in synchronisé des couches actives. Les
 * managers (`SlotManager` en `deferCommit`) mis à jour dans le même tick
 * forment un groupe ; quand tous sont prêts, ils committent ensemble.
 *
 * Extrait de `layers.ts` (sémantique inchangée) pour être testable sans carte.
 */

/** Surface d'un `SlotManager` utilisée par le coordinateur. */
export interface Committable {
	isReady(): boolean;
	commitNow(): void;
}

export interface CommitGroupHooks {
	/** Plus rien en attente (groupe vidé ou committé) : couper le spinner. */
	onSettled: () => void;
	/** Le groupe vient d'être committé en entier (après `onSettled`). */
	onFlushed: () => void;
}

export class CommitGroup<T extends Committable = Committable> {
	/** Managers dont on attend le commit groupé pour le tick courant. */
	private members: Set<T> | null = null;
	private hooks: CommitGroupHooks;

	constructor(hooks: CommitGroupHooks) {
		this.hooks = hooks;
	}

	/**
	 * Démarre un nouveau groupe : appeler AVANT les `update()` correspondants.
	 * `keep` reporte dans le nouveau groupe les membres du groupe en vol qu'il
	 * accepte (p. ex. une superposition encore en chargement, non rechargée par
	 * cet appel) : sans ça, leur commit différé ne serait jamais exécuté. Sans
	 * `keep`, le groupe en vol est remplacé (comportement historique).
	 */
	begin(managers: T[], keep?: (mgr: T) => boolean): void {
		const carried = keep && this.members ? [...this.members].filter(keep) : [];
		const next = [...managers, ...carried];
		this.members = next.length > 0 ? new Set(next) : null;
		if (!this.members) this.hooks.onSettled();
	}

	/** Appelé par chaque manager (onReady) : committe tout le groupe quand tous sont prêts. */
	tryFlush(): void {
		if (!this.members) return;
		const members = [...this.members];
		if (members.every((mgr) => mgr.isReady())) {
			for (const mgr of members) mgr.commitNow();
			this.members = null;
			this.hooks.onSettled();
			this.hooks.onFlushed();
		}
	}

	/** Ajoute un manager au groupe courant, ou démarre un groupe s'il n'y en a pas. */
	add(mgr: T): void {
		if (this.members) this.members.add(mgr);
		else this.members = new Set([mgr]);
	}

	/** Appelé par un manager en erreur : on le retire du groupe pour ne pas bloquer les autres. */
	drop(mgr: T): void {
		if (!this.members) {
			this.hooks.onSettled();
			return;
		}
		this.removeMember(mgr);
	}

	/**
	 * Manager détruit (superposition retirée) : il ne sera jamais prêt ni en
	 * erreur, donc on le sort du groupe en vol pour ne pas bloquer le commit des
	 * autres. Sans effet s'il n'en fait pas partie.
	 */
	forget(mgr: T): void {
		if (!this.members?.has(mgr)) return;
		this.removeMember(mgr);
	}

	private removeMember(mgr: T): void {
		if (!this.members) return;
		this.members.delete(mgr);
		if (this.members.size === 0) {
			this.members = null;
			this.hooks.onSettled();
			return;
		}
		this.tryFlush();
	}
}
