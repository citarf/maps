// Cache des rendus coûteux (raster, isobares, GeoJSON), limité au run affiché.
//
// Une génération est attribuée à chaque run : un rendu lancé pour un run puis
// terminé après la bascule vers un autre (course de rasterisation) porte une
// génération périmée, son écriture est refusée et sa ressource libérée.
// Clé : `<run_id>:<product_id>:<valid_time>`.

export const renderKey = (runId: string, productId: string, validTime: string) =>
	`${runId}:${productId}:${validTime}`;

export class RunScopedCache<V> {
	private generation = 0;
	private runId: string | undefined;
	private readonly entries = new Map<string, V>();

	constructor(private readonly dispose: (v: V) => void = () => {}) {}

	/** Fixe le run courant (purge si différent) et renvoie la génération à présenter à `set`. */
	scope(runId: string | undefined): number {
		if (runId !== this.runId) {
			this.runId = runId;
			this.generation++;
			for (const v of this.entries.values()) this.dispose(v);
			this.entries.clear();
		}
		return this.generation;
	}

	get(key: string): V | undefined {
		return this.entries.get(key);
	}

	/**
	 * N'écrit que si `generation` est toujours la génération courante ; sinon
	 * libère la valeur et renvoie `false` (le rendu appartient à un run révolu).
	 */
	set(generation: number, key: string, value: V): boolean {
		if (generation !== this.generation) {
			this.dispose(value);
			return false;
		}
		const prev = this.entries.get(key);
		if (prev !== undefined && prev !== value) this.dispose(prev);
		this.entries.set(key, value);
		return true;
	}

	/** Retire et libère une entrée (ex. ressource suspectée après un échec de chargement). */
	delete(key: string): void {
		const v = this.entries.get(key);
		if (v === undefined) return;
		this.entries.delete(key);
		this.dispose(v);
	}

	get size(): number {
		return this.entries.size;
	}
}
