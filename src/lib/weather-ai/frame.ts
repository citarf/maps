// Échéance Weather AI correspondant à l'heure de la frise principale (store
// `time`), commune à toutes les couches de l'app. Weather AI est au pas de 6 h
// depuis son `init_time` (+6 à +72 h) : on montre l'échéance la plus proche
// inférieure ou égale à l'heure choisie, en le disant quand l'heure tombe entre
// deux échéances, et rien hors de l'horizon (pas de position à +72 h affichée
// pour une heure à +96 h).

export type FrameRelation = 'exact' | 'between' | 'before' | 'after' | 'none';

export interface ResolvedFrame {
	/** Échéance Weather AI affichée, absente hors horizon. */
	validTime?: string;
	relation: FrameRelation;
	/** Première et dernière échéances du run (horizon). */
	horizon?: { first: string; last: string };
}

export function resolveFrame(times: string[], selected: Date | undefined): ResolvedFrame {
	const sorted = [...times].sort();
	if (!sorted.length || !selected || Number.isNaN(selected.getTime())) return { relation: 'none' };
	const horizon = { first: sorted[0], last: sorted[sorted.length - 1] };
	const t = selected.getTime();
	if (t < Date.parse(horizon.first)) return { relation: 'before', horizon };
	if (t > Date.parse(horizon.last)) return { relation: 'after', horizon };
	let validTime = sorted[0];
	for (const vt of sorted) {
		if (Date.parse(vt) <= t) validTime = vt;
		else break;
	}
	return { validTime, relation: Date.parse(validTime) === t ? 'exact' : 'between', horizon };
}
