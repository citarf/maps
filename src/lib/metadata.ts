import { get } from 'svelte/store';

import { type DomainMetaDataJson, VARIABLE_PREFIX } from '@openmeteo/weather-map-layer';

import { loading } from '$lib/stores/preferences';
import { inProgress as iP, latest as l, metaJson as mJ, modelRun as mR } from '$lib/stores/time';
import { domain as d, selectedDomain, variable as v } from '$lib/stores/variables';

import { DOMAIN_DEFAULT_VARIABLES, WEATHER_AI_DOMAIN } from '$lib/constants';

import { fmtModelRun, getBaseUri } from './helpers';

/** Le domaine n'a encore publié aucune échéance : rien à afficher, sans que ce
 *  soit une panne (message destiné à l'utilisateur). */
export class DomainUnavailableError extends Error {}

/** Domaines dont le tout premier run peut être consulté pendant sa publication :
 *  le producteur Weather AI ne dépose `latest.json` qu'après la 12ᵉ échéance,
 *  mais réécrit `in-progress.json` (`completed: false`) après chaque `.om`. */
const FIRST_RUN_FROM_IN_PROGRESS: ReadonlySet<string> = new Set([WEATHER_AI_DOMAIN]);

export const getInitialMetaData = async () => {
	const domain = get(selectedDomain);
	const uri = getBaseUri(domain.value);

	const [latestRes, inProgressRes] = await Promise.all([
		fetch(`${uri}/data_spatial/${domain.value}/latest.json`),
		fetch(`${uri}/data_spatial/${domain.value}/in-progress.json`)
	]);

	// Premier run en cours de publication : `latest.json` n'existe pas encore. Le
	// run en cours tient lieu de dernier run (sélectionné par défaut, limité à ses
	// échéances déposées) jusqu'à ce que `latest.json` paraisse. Seul un 404 de
	// `latest.json` est concerné ; toute autre réponse reste une erreur.
	if (FIRST_RUN_FROM_IN_PROGRESS.has(domain.value) && latestRes.status === 404) {
		const unavailable = new DomainUnavailableError(
			`${domain.label} : aucune échéance publiée pour l'instant (premier run en cours de publication).`
		);
		if (inProgressRes.status === 404) {
			loading.set(false);
			throw unavailable;
		}
		if (!inProgressRes.ok) {
			loading.set(false);
			throw new Error(`HTTP ${inProgressRes.status}`);
		}
		const run: DomainMetaDataJson = await inProgressRes.json();
		if (!run.valid_times?.length) {
			loading.set(false);
			throw unavailable;
		}
		l.set(run);
		iP.set(run);
		return;
	}

	for (const res of [latestRes, inProgressRes]) {
		if (!res.ok) {
			loading.set(false);
			throw new Error(`HTTP ${res.status}`);
		}
		if (res.url.includes('latest.json')) l.set(await res.json());
		if (res.url.includes('in-progress.json')) iP.set(await res.json());
	}
};

const toDate = (dateString: string | undefined): Date | undefined =>
	dateString ? new Date(dateString) : undefined;

const matchesModelRun = (referenceTime: Date | undefined, modelRun: Date): boolean =>
	referenceTime?.getTime() === modelRun.getTime();

const fetchMetaData = async (
	uri: string,
	domain: string,
	modelRun: Date
): Promise<DomainMetaDataJson> => {
	const url = `${uri}/data_spatial/${domain}/${fmtModelRun(modelRun)}/meta.json`;
	const res = await fetch(url);

	if (!res.ok) {
		loading.set(false);
		throw new Error(`HTTP ${res.status}`);
	}

	return res.json();
};

export const getMetaData = async (): Promise<DomainMetaDataJson> => {
	const domain = get(d);
	const uri = getBaseUri(domain);

	const latest = get(l);
	const latestReferenceTime = toDate(latest?.reference_time);

	if (get(mR) === undefined) {
		mR.set(latestReferenceTime);
	}
	const modelRun = get(mR) as Date;

	const inProgress = get(iP);
	const inProgressReferenceTime = toDate(inProgress?.reference_time);

	const result: DomainMetaDataJson = matchesModelRun(latestReferenceTime, modelRun)
		? (latest as DomainMetaDataJson)
		: matchesModelRun(inProgressReferenceTime, modelRun)
			? (inProgress as DomainMetaDataJson)
			: await fetchMetaData(uri, domain, modelRun);

	result.valid_times.sort();
	return result;
};

export const matchVariableOrFirst = () => {
	const variable = get(v);
	const metaJson = get(mJ);
	if (!metaJson || metaJson.variables.includes(variable)) return;
	if (variable === 'temperature_2m_anomaly') return;

	let matched: string | undefined;
	const prefix = variable.match(VARIABLE_PREFIX)?.groups?.prefix;

	if (prefix) {
		matched = metaJson.variables.find((mv) => mv.startsWith(prefix));
	}

	// Défaut par domaine (ex. arome_france_convection → radar_reflectivity) avant le
	// fallback `variables[0]`, à condition que la variable préférée soit publiée.
	const domainDefault = DOMAIN_DEFAULT_VARIABLES[get(d)];
	if (!matched && domainDefault && metaJson.variables.includes(domainDefault)) {
		matched = domainDefault;
	}

	v.set(matched ?? metaJson.variables[0]);
};
