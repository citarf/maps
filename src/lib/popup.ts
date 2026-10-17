import { get } from 'svelte/store';

import {
	GridFactory,
	createClippingTester,
	getCachedResolvedClipping,
	getColor,
	getColorScale,
	getValueFromLatLong
} from '@openmeteo/weather-map-layer';
import * as maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';

import { basemapTheme } from '$lib/stores/basemap-theme';
import { map as m, popup as p, popupMode } from '$lib/stores/map';
import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
import { pointWorkspace } from '$lib/stores/point-workspace';
import { sounding, soundingButtonEnabled } from '$lib/stores/sounding';
import { convertValue, getDisplayUnit, unitPreferences } from '$lib/stores/units';
import { selectedDomain, variable as v } from '$lib/stores/variables';
import { arrowStyle } from '$lib/stores/vector-styles';

import { isSoundingDomain } from '$lib/constants';
import { hasMeteogram } from '$lib/meteogram/model-map';
import {
	ARROW_LENGTH_ANCHORS,
	ARROW_OPACITY_RANGE,
	ARROW_PX,
	ARROW_UNITS,
	ARROW_WIDTH_RANGE,
	HEAD_DEPTH,
	HEAD_HALF,
	arrowStyleAnchors,
	isPressureOrHeight,
	rampAt,
	rescaledRamp,
	shortLabel,
	unwrapAngle
} from '$lib/popup-format';

import { textWhite } from './helpers';
import { arrowManager, getOverlayValueSources, rasterManager } from './layers';
import { terraDrawActive } from './stores/clipping';
import { desktop, opacity } from './stores/preferences';
import { resolveWindArrowLevel } from './url';
import { trueElevation } from './view-3d';

let el: HTMLDivElement | undefined;
let wrapperDiv: HTMLDivElement | undefined;
let contentDiv: HTMLDivElement | undefined;
let valueSpan: HTMLSpanElement | undefined;
let unitSpan: HTMLSpanElement | undefined;
let elevationSpan: HTMLSpanElement | undefined;
let windSpan: HTMLSpanElement | undefined;
let stemDiv: HTMLDivElement | undefined;
let extrasDiv: HTMLDivElement | undefined;
let arrowSpan: HTMLSpanElement | undefined;
let arrowSvg: SVGSVGElement | undefined;
let arrowPath: SVGPathElement | undefined;
let soundingBtn: HTMLButtonElement | undefined;
let meteogramBtn: HTMLButtonElement | undefined;
let lastCoords: maplibregl.LngLat | undefined;

const WIND_VARIABLE_REGEX = /_(?:u|v)_component_/;

// Cached clipping tester — recomputed only when clippingOptions reference changes.
let cachedClippingOptionsRef: unknown = undefined;
let cachedClippingTester: ((lon: number, lat: number) => boolean) | undefined;

// =============================================================================
// Flèche de direction (portage d'open-meteo/maps #373)
// =============================================================================

interface ArrowPose {
	/** Degrés continus (non repliés), cf. `arrowAngle`. */
	angle: number;
	length: number;
	opacity: number;
	width: number;
}

// Angle continu : interpoler vers la valeur brute ferait le grand tour à 0/360.
let arrowAngle = 0;
let arrowPose: ArrowPose | undefined;
let arrowTarget: ArrowPose | undefined;
let arrowFrame = 0;
/** Dernier échantillon, pour réorienter la flèche quand seule la vue change. */
let arrowDirection: number | undefined;
let arrowSpeed = 0;
/** Part de la distance restante parcourue à chaque frame. */
const ARROW_EASE = 0.25;

/**
 * Redessine la flèche en un seul tracé, rotation comprise dans les coordonnées :
 * une transformation CSS se pixelisait (le navigateur réutilise un bitmap
 * rastérisé une fois) ; recalculer la géométrie ne coûte rien à cette taille.
 */
const drawArrow = (pose: ArrowPose): void => {
	if (!arrowSvg || !arrowPath) return;
	const centre = ARROW_UNITS / 2;
	const radians = (pose.angle * Math.PI) / 180;
	const sin = Math.sin(radians);
	const cos = Math.cos(radians);
	// Rotation horaire autour du centre, comme `rotatePoint` des flèches de la carte
	const at = (x: number, y: number): string =>
		`${(centre + x * cos - y * sin).toFixed(2)} ${(centre + x * sin + y * cos).toFixed(2)}`;
	const half = pose.length / 2;
	const barb = HEAD_DEPTH - half;
	arrowPath.setAttribute(
		'd',
		`M${at(0, half)}L${at(0, -half)}M${at(-HEAD_HALF, barb)}L${at(0, -half)}L${at(HEAD_HALF, barb)}`
	);
	arrowSvg.style.opacity = String(pose.opacity);
	// Épaisseurs en px ; le viewBox fait ARROW_PX de large à l'écran
	arrowSvg.style.strokeWidth = String(pose.width * (ARROW_UNITS / ARROW_PX));
};

/** Rapproche la pose dessinée du dernier échantillon jusqu'à l'atteindre. */
const stepArrow = (): void => {
	arrowFrame = 0;
	if (!arrowPose || !arrowTarget) return;
	const from = arrowPose;
	const to = arrowTarget;
	const next: ArrowPose = {
		angle: from.angle + (to.angle - from.angle) * ARROW_EASE,
		length: from.length + (to.length - from.length) * ARROW_EASE,
		opacity: from.opacity + (to.opacity - from.opacity) * ARROW_EASE,
		width: from.width + (to.width - from.width) * ARROW_EASE
	};
	// Sous un dixième de degré / un centième d'unité, plus rien n'est visible
	const settled =
		Math.abs(to.angle - next.angle) < 0.1 &&
		Math.abs(to.length - next.length) < 0.01 &&
		Math.abs(to.opacity - next.opacity) < 0.005 &&
		Math.abs(to.width - next.width) < 0.01;
	arrowPose = settled ? { ...to } : next;
	drawArrow(arrowPose);
	if (!settled) arrowFrame = requestAnimationFrame(stepArrow);
};

/**
 * Angle à l'écran (degrés, sens horaire depuis le haut) d'un cap `heading` en
 * `lngLat`. La bulle reste alignée sur l'écran pour que le texte soit droit :
 * orientation, inclinaison et perspective sont donc appliquées ici, en
 * projetant un petit pas le long du cap.
 */
const screenAngle = (map: maplibregl.Map, lngLat: maplibregl.LngLat, heading: number): number => {
	const from = maplibregl.MercatorCoordinate.fromLngLat(lngLat);
	const radians = (heading * Math.PI) / 180;
	// Environ un pixel écran au zoom courant ; y Mercator croît vers le sud
	const step = 2 ** -(map.getZoom() + 9);
	const to = new maplibregl.MercatorCoordinate(
		from.x + Math.sin(radians) * step,
		from.y - Math.cos(radians) * step,
		0
	);
	const a = map.project(lngLat);
	const b = map.project(to.toLngLat());
	return (Math.atan2(b.x - a.x, a.y - b.y) * 180) / Math.PI;
};

/**
 * Oriente la flèche dans le sens de l'écoulement et la dimensionne selon
 * `speed` (valeur brute, dans l'unité des seuils des flèches de la carte).
 * `direction` est la direction météo d'où vient l'écoulement (les flèches de la
 * carte tournent de direction + 180). `undefined`/NaN masque la flèche.
 */
const setArrow = (direction: number | undefined, speed: number): void => {
	if (!arrowSpan || !arrowSvg || !arrowPath) return;
	arrowDirection = direction;
	arrowSpeed = speed;
	if (direction === undefined || !isFinite(direction)) {
		if (arrowFrame) cancelAnimationFrame(arrowFrame);
		arrowFrame = 0;
		// Oubliée : le prochain échantillon repart de lui, pas d'une pose périmée
		arrowPose = undefined;
		arrowSpan.classList.remove('popup-arrow-visible');
		return;
	}

	const map = get(m);
	const lngLat = get(p)?.getLngLat();
	const target = map && lngLat ? screenAngle(map, lngLat, direction + 180) : direction + 180;
	arrowAngle = unwrapAngle(arrowAngle, target);

	const style = arrowStyleAnchors(get(arrowStyle), get(basemapTheme) === 'dark');
	arrowTarget = {
		angle: arrowAngle,
		length: rampAt(ARROW_LENGTH_ANCHORS, speed, 1) * ARROW_UNITS,
		opacity: rescaledRamp(style, speed, 1, ARROW_OPACITY_RANGE),
		width: rescaledRamp(style, speed, 2, ARROW_WIDTH_RANGE)
	};

	if (!arrowPose) {
		// Premier échantillon depuis le masquage : on s'y pose sans interpoler
		arrowPose = { ...arrowTarget };
		drawArrow(arrowPose);
		arrowSpan.classList.add('popup-arrow-visible');
		return;
	}
	if (!arrowFrame) arrowFrame = requestAnimationFrame(stepArrow);
};

/** Réoriente la flèche sur le dernier échantillon après un changement de vue. */
const realignArrow = (): void => {
	if (get(p)) setArrow(arrowDirection, arrowSpeed);
};

/** Place la flèche devant la valeur qu'elle décrit (valeur principale ou vent). */
const placeArrowBefore = (target: HTMLElement | undefined): void => {
	if (arrowSpan && target && arrowSpan.nextSibling !== target) {
		target.parentElement?.insertBefore(arrowSpan, target);
	}
};

// =============================================================================
// Lignes des superpositions (portage d'open-meteo/maps #361)
// =============================================================================

const STEM_BASE_HEIGHT = 24;

// Jeton croissant : seule la dernière mise à jour écrit dans le DOM, pour qu'une
// lecture lente d'une position antérieure n'écrase pas les valeurs plus récentes.
let popupUpdateSeq = 0;

/** Remonte la bulle et allonge la tige de la hauteur des lignes ajoutées. */
const adjustStemForExtras = (): void => {
	if (!wrapperDiv || !stemDiv || !extrasDiv) return;
	const extraHeight = extrasDiv.offsetHeight;
	wrapperDiv.style.transform = extraHeight ? `translateY(-${extraHeight}px)` : '';
	stemDiv.style.height = `${STEM_BASE_HEIGHT + extraHeight}px`;
};

/**
 * Valeur de chaque superposition au point (hors variable du fond, déjà dans la
 * pastille), une ligne « libellé valeur unité » chacune.
 */
const updateExtraSources = async (
	coordinates: maplibregl.LngLat,
	primaryVariable: string,
	seq: number
): Promise<void> => {
	if (!extrasDiv) return;
	const extras = getOverlayValueSources().filter(({ variable }) => variable !== primaryVariable);
	if (!extras.length) {
		extrasDiv.replaceChildren();
		adjustStemForExtras();
		return;
	}

	const colorScales = get(omProtocolSettings).colorScales;
	const units = get(unitPreferences);
	const isDark = mode.current === 'dark';
	const lines = await Promise.all(
		extras.map(async ({ variable, url }) => {
			try {
				const { value } = await getValueFromLatLong(coordinates.lat, coordinates.lng, url);
				const colorScale = getColorScale(variable, isDark, colorScales);
				const label = shortLabel(variable);
				if (!isFinite(value)) return { text: `${label} : –`, small: false, muted: true };
				const displayValue = convertValue(value, colorScale.unit, units, variable);
				const unit = getDisplayUnit(colorScale.unit, units, variable);
				return {
					text: `${label} : ${displayValue.toFixed(1)} ${unit}`,
					small: isPressureOrHeight(variable),
					// Une valeur qui s'affiche à zéro est du contexte, pas du signal
					muted: Math.round(Math.abs(displayValue) * 10) === 0
				};
			} catch {
				// Frame pas encore décodée (cf. « State not found ») : ligne omise
				return undefined;
			}
		})
	);

	if (seq !== popupUpdateSeq) return;
	extrasDiv.replaceChildren(
		...lines
			.filter((line) => line !== undefined)
			.map((line) => {
				const lineDiv = document.createElement('div');
				lineDiv.classList.add('popup-extra-line');
				if (line.small) lineDiv.classList.add('popup-extra-line-sm');
				if (line.muted) lineDiv.classList.add('popup-extra-line-muted');
				lineDiv.innerText = line.text;
				return lineDiv;
			})
	);
	adjustStemForExtras();
};

const initPopupDiv = (): void => {
	el = document.createElement('div');
	el.classList.add('popup');

	stemDiv = document.createElement('div');
	stemDiv.classList.add('popup-stem');
	const dotDiv = document.createElement('div');
	dotDiv.classList.add('popup-dot');
	stemDiv.append(dotDiv);
	el.append(stemDiv);

	wrapperDiv = document.createElement('div');
	wrapperDiv.classList.add('popup-wrapper');

	contentDiv = document.createElement('div');
	contentDiv.classList.add('popup-content');

	// Flèche de direction (portage d'open-meteo/maps #373) : pointe là où va
	// l'écoulement, comme les flèches de la carte ; masquée sans direction.
	// `drawArrow` réécrit toute la forme dans le tracé à chaque frame.
	arrowSpan = document.createElement('span');
	arrowSpan.classList.add('popup-arrow');
	arrowSpan.innerHTML =
		`<svg viewBox="0 0 ${ARROW_UNITS} ${ARROW_UNITS}" fill="none" stroke="currentColor" ` +
		'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
		'<path class="popup-arrow-path" /></svg>';
	arrowSvg = arrowSpan.querySelector('svg') ?? undefined;
	arrowPath = arrowSpan.querySelector<SVGPathElement>('.popup-arrow-path') ?? undefined;

	valueSpan = document.createElement('span');
	valueSpan.classList.add('popup-value');
	unitSpan = document.createElement('span');
	unitSpan.classList.add('popup-unit');
	windSpan = document.createElement('span');
	windSpan.classList.add('popup-wind');
	elevationSpan = document.createElement('span');
	elevationSpan.classList.add('popup-elevation');

	contentDiv.append(arrowSpan);
	contentDiv.append(valueSpan);
	contentDiv.append(unitSpan);
	contentDiv.append(windSpan);
	contentDiv.append(elevationSpan);

	wrapperDiv.append(contentDiv);

	// Une ligne par superposition de la composition (valeur au point).
	extrasDiv = document.createElement('div');
	extrasDiv.classList.add('popup-extras');
	wrapperDiv.append(extrasDiv);

	soundingBtn = document.createElement('button');
	soundingBtn.className = 'popup-sounding-btn';
	soundingBtn.innerText = 'Sondage vertical';
	soundingBtn.addEventListener('click', () => {
		if (lastCoords) sounding.open(lastCoords.lat, lastCoords.lng);
	});
	wrapperDiv.append(soundingBtn);

	meteogramBtn = document.createElement('button');
	meteogramBtn.className = 'popup-meteogram-btn';
	meteogramBtn.innerText = 'Météogramme';
	meteogramBtn.addEventListener('click', () => {
		if (lastCoords) pointWorkspace.open(lastCoords.lat, lastCoords.lng);
	});
	wrapperDiv.append(meteogramBtn);

	el.append(wrapperDiv);
};

/** Update the popup content for the given coordinates without moving the marker. */
const updatePopupContent = async (coordinates: maplibregl.LngLat): Promise<void> => {
	lastCoords = coordinates;

	// Les boutons d'action ne sont utiles qu'une fois la bulle épinglée (mode
	// « drag ») : en mode « follow » elle suit le curseur et est traversante
	// (pointer-events: none, cf. renderPopup), donc ses boutons ne sont de toute
	// façon pas cliquables. On les masque au survol pour restaurer la bulle-viseur
	// compacte d'origine (valeur/unité/vent/altitude, sans bouton).
	const pinned = get(popupMode) === 'drag';

	// Le bouton « Sondage vertical » n'apparaît que sur les modèles à niveaux de
	// pression (AROME 0,025°) et si l'option est activée dans les réglages.
	if (soundingBtn) {
		const enabled =
			pinned && isSoundingDomain(get(selectedDomain).value) && get(soundingButtonEnabled);
		soundingBtn.style.display = enabled ? '' : 'none';
	}

	if (meteogramBtn) {
		meteogramBtn.style.display = pinned && hasMeteogram(get(selectedDomain).value) ? '' : 'none';
	}

	if (!el || !contentDiv || !valueSpan || !unitSpan || !windSpan || !elevationSpan) return;

	const map = get(m);

	// `queryTerrainElevation` renvoie l'altitude DEM × exagération du terrain ; on
	// annule l'exagération (1,4 en vue 3D) pour afficher l'altitude réelle.
	const elevation = trueElevation(
		map?.queryTerrainElevation(coordinates),
		map?.getTerrain()?.exaggeration
	);
	const hasElevation = typeof elevation === 'number' && isFinite(elevation);

	const activeUrl = rasterManager?.getActiveSourceUrl();
	if (!activeUrl) return;
	const seq = ++popupUpdateSeq;

	// L'arrowManager dessine dès qu'un niveau de vent est résolu (overlay explicite OU
	// fallback « selon la variable affichée » sur variable non-vent). On lit alors le
	// vent depuis lui, sauf si la variable affichée est elle-même une composante u/v
	// (sa valeur principale est déjà du vent).
	const showWind = resolveWindArrowLevel() !== null && !WIND_VARIABLE_REGEX.test(get(v));
	const windUrl = showWind ? arrowManager?.getActiveSourceUrl() : undefined;

	const [valueResult, windResult] = await Promise.all([
		getValueFromLatLong(coordinates.lat, coordinates.lng, activeUrl).catch(() => undefined),
		windUrl
			? getValueFromLatLong(coordinates.lat, coordinates.lng, windUrl).catch(() => undefined)
			: Promise.resolve(undefined),
		// Valeurs et ligne de chaque superposition, en parallèle de la valeur principale
		updateExtraSources(coordinates, get(v), seq)
	]);
	if (seq !== popupUpdateSeq) return;

	// L'état décodé de la frame courante peut être absent du cache du protocole `om://`
	// (capacité ~2 états : un décode anticipé de voisins ou un chargement encore en vol
	// l'évince) — `getValueFromLatLong` lève alors « State not found for key ». Ce n'est
	// pas une absence de donnée au point : on conserve le contenu courant du popup plutôt
	// que d'afficher « Pas de données » à tort (et on coupe le spam d'« uncaught (in promise) »).
	if (!valueResult) return;
	const { value } = valueResult;

	if (isFinite(value)) {
		const omProtocolSettingsState = get(omProtocolSettings);
		const clippingOptions = omProtocolSettingsState.clippingOptions;

		if (clippingOptions) {
			if (clippingOptions !== cachedClippingOptionsRef) {
				cachedClippingOptionsRef = clippingOptions;
				cachedClippingTester = createClippingTester(getCachedResolvedClipping(clippingOptions));
			}
			if (cachedClippingTester && !cachedClippingTester(coordinates.lng, coordinates.lat)) {
				contentDiv.style.backgroundColor = '';
				contentDiv.style.color = '';
				setArrow(undefined, 0);
				valueSpan.innerText = 'Hors zone';
				unitSpan.innerText = '';
				windSpan.innerText = '';
				elevationSpan.innerText = hasElevation ? `${Math.round(elevation)}m` : '';
				return;
			}
		}

		const isDark = mode.current === 'dark';
		const colorScale = getColorScale(get(v), isDark, omProtocolSettingsState.colorScales);
		const color = getColor(colorScale, value);

		const popupOpacity =
			color[3] && color[3] ? (color[3] * get(opacity)) / 100 : get(opacity) / 100;

		contentDiv.style.backgroundColor = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${popupOpacity})`;
		contentDiv.style.color = textWhite(color, isDark) ? 'white' : 'black';
		const units = get(unitPreferences);
		const variable = get(v);
		const displayValue = convertValue(value, colorScale.unit, units, variable);
		valueSpan.innerText = displayValue.toFixed(1);
		unitSpan.innerText = getDisplayUnit(colorScale.unit, units, variable);
		// Flèche devant la valeur qu'elle décrit : la variable affichée si elle
		// porte une direction (vent, vagues…), sinon le vent du calque de flèches.
		const windShown = !!windResult && isFinite(windResult.value);
		const arrowOnWind =
			!isFinite(valueResult.direction ?? NaN) && windShown && isFinite(windResult.direction ?? NaN);
		if (windShown) {
			const windDisplay = convertValue(windResult.value, 'm/s', units);
			// La flèche sert de séparateur quand elle précède le vent
			const separator = arrowOnWind ? '' : '· ';
			windSpan.innerText = `${separator}${windDisplay.toFixed(1)} ${getDisplayUnit('m/s', units)}`;
		} else {
			windSpan.innerText = '';
		}
		if (isFinite(valueResult.direction ?? NaN)) {
			placeArrowBefore(valueSpan);
			setArrow(valueResult.direction, value);
		} else if (arrowOnWind) {
			placeArrowBefore(windSpan);
			setArrow(windResult.direction, windResult.value);
		} else {
			setArrow(undefined, 0);
		}
		elevationSpan.innerText = hasElevation ? `${Math.round(elevation)}m` : '';
		elevationSpan.style.color = textWhite(color, isDark) ? 'white' : 'black';
	} else {
		contentDiv.style.backgroundColor = '';
		contentDiv.style.color = '';
		setArrow(undefined, 0);

		const domainBounds = GridFactory.create(get(selectedDomain).grid).getBounds();
		const [minLon, minLat, maxLon, maxLat] = domainBounds;
		const insideDomain =
			coordinates.lat >= minLat &&
			coordinates.lat <= maxLat &&
			coordinates.lng >= minLon &&
			coordinates.lng <= maxLon;

		valueSpan.innerText = insideDomain ? 'Pas de données' : 'Hors domaine';
		unitSpan.innerText = '';
		windSpan.innerText = '';
		elevationSpan.innerText = hasElevation ? `${Math.round(elevation)}m` : '';
		elevationSpan.style.color = '';
	}
};

/** Ensure the marker exists, place it at `coordinates`, and update its content. */
export const renderPopup = async (coordinates: maplibregl.LngLat): Promise<void> => {
	const map = get(m);
	if (!get(popupMode) || !map) return;

	if (!el || !contentDiv || !valueSpan || !unitSpan || !elevationSpan) initPopupDiv();
	if (!el || !contentDiv || !valueSpan || !unitSpan || !elevationSpan) return;

	// En mode « follow », la bulle suit le curseur : elle passe donc sous chaque
	// clic destiné à la carte. Sans ça, le bouton « Meteogram » (visible par
	// défaut, contrairement au sondage opt-in) avale le clic d'épinglage et
	// ouvre le tiroir à la place. La bulle-viseur est traversante ; ses boutons
	// ne deviennent cliquables qu'une fois la bulle épinglée (mode « drag »).
	el.style.pointerEvents = get(popupMode) === 'follow' ? 'none' : '';

	let popup = get(p);
	if (!popup) {
		popup = new maplibregl.Marker({ element: el, draggable: get(popupMode) === 'drag' })
			.setLngLat(coordinates)
			.addTo(map);
		p.set(popup);

		popup.on('drag', async () => {
			const lngLat = popup?.getLngLat();
			if (lngLat) await updatePopupContent(lngLat);
		});
	} else {
		popup.setLngLat(coordinates).addTo(map);
	}

	await updatePopupContent(coordinates);
};

export const refreshPopup = async (): Promise<void> => {
	const popup = get(p);
	const lngLat = popup?.getLngLat();
	if (lngLat) await updatePopupContent(lngLat);
};

const updatePopup = async (e: maplibregl.MapMouseEvent): Promise<void> => {
	if (get(popupMode) === 'follow' && !get(terraDrawActive)) {
		const popup = get(p);
		if (popup) {
			popup.setLngLat(e.lngLat);
		}
		await renderPopup(e.lngLat);
	}
};

export const switchPopupMode = (): void => {
	if (get(popupMode) === null) {
		if (desktop.current) {
			popupMode.set('follow');
		} else {
			popupMode.set('drag');
		}
	} else if (get(popupMode) === 'follow') {
		popupMode.set('drag');
		return;
	} else if (get(popupMode) === 'drag') {
		popupMode.set(null);
		return;
	}
};

export const addPopup = (): void => {
	const map = get(m);
	if (!map) return;

	map.on('mousemove', updatePopup);
	// Orientation, inclinaison et, sous inclinaison, la position de la bulle
	// changent la direction apparente : `move` les couvre toutes.
	map.on('move', realignArrow);

	map.on('click', async (e: maplibregl.MapLayerMouseEvent) => {
		if (!map || get(terraDrawActive)) return;

		switchPopupMode();

		if (get(popupMode) === null) {
			removePopup();
			return;
		}

		// Re-add mousemove listener (may have been removed by a previous removePopup)
		map.off('mousemove', updatePopup);
		map.on('mousemove', updatePopup);

		await renderPopup(e.lngLat);
	});

	// Clic droit : épingle directement la bulle (mode « drag ») en 1 geste → le
	// bouton Météogramme est cliquable tout de suite, au lieu des 3 clics gauche
	// (follow → pin → bouton). Desktop uniquement (pas d'event contextmenu tactile).
	map.on('contextmenu', async (e: maplibregl.MapLayerMouseEvent) => {
		if (!map || get(terraDrawActive)) return;
		e.preventDefault();
		map.off('mousemove', updatePopup); // épinglé : la bulle ne suit pas le curseur
		const existing = get(p);
		if (existing) {
			existing.remove(); // marker frais → recréé draggable en mode 'drag'
			p.set(undefined);
		}
		popupMode.set('drag');
		await renderPopup(e.lngLat);
	});
};

export const removePopup = (): void => {
	const map = get(m);
	if (!map) return;

	map.off('mousemove', updatePopup);

	const popup = get(p);
	popup?.remove();
	p.set(undefined);
};
