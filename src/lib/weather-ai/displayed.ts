// Ce qui est RÉELLEMENT affiché sur la carte, distinct de la sélection : après
// un délai dépassé (`timeout`), la carte garde l'état précédent, et les mentions
// (run, échéance, UTC) doivent décrire cet état-là, pas celui demandé.
import { type LoadedRun, leadHours } from './loader';
import { formatLead, formatUtc } from './render';

import type { CommitResult } from './layer-switcher';

export interface DisplayedState {
	runId: string;
	validTime: string;
	initTime: string | undefined;
	demo: boolean;
}

/** État affiché après un commit : seul un slot réellement montré ou effacé le change. */
export function displayedAfterCommit(
	result: CommitResult,
	input: { run: LoadedRun | undefined; vt: string | undefined },
	prev: DisplayedState | null
): DisplayedState | null {
	if (result === 'shown') {
		return input.run && input.vt
			? {
					runId: input.run.runId,
					validTime: input.vt,
					initTime: input.run.initTime,
					demo: !!input.run.demo
				}
			: null;
	}
	if (result === 'cleared') return null;
	return prev; // stale, unchanged, timeout : la carte n'a pas changé
}

export interface CardSummary {
	/** Échéance et run de l'état affiché, ou rien si la carte ne montre rien. */
	shown?: { lead: string; utc: string; runId: string; elapsed: boolean; demo: boolean };
	/** La sélection n'est pas (encore) celle affichée. */
	pending: boolean;
	/** Erreur à montrer, qu'un run soit affiché ou non. */
	error?: string;
}

export function cardSummary(
	displayed: DisplayedState | null,
	selected: { runId: string | undefined; validTime: string | undefined },
	status: { state: string; message?: string },
	now: number
): CardSummary {
	const summary: CardSummary = {
		pending:
			!!selected.validTime &&
			(displayed?.runId !== selected.runId || displayed?.validTime !== selected.validTime),
		error: status.state === 'error' ? status.message : undefined
	};
	if (displayed) {
		summary.shown = {
			lead: formatLead(leadHours(displayed.initTime, displayed.validTime)),
			utc: formatUtc(displayed.validTime),
			runId: displayed.runId,
			elapsed: Date.parse(displayed.validTime) < now,
			demo: displayed.demo
		};
	}
	return summary;
}
