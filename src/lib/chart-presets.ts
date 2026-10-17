/**
 * Compositions toutes faites (combinaisons de variables affichées ensemble).
 */
import type { ChartPreset } from '$lib/chart-types';

/** Ordre d'affichage des groupes de compositions. */
export const PRESET_GROUP_ORDER: readonly string[] = [
	'Synoptique',
	'Surface',
	'Précipitations',
	'Infoclimat'
];

export const chartPresets: ChartPreset[] = [
	// ── Synoptique ───────────────────────────────────────────────────
	{
		id: 'z500_t850',
		label: 'Température 850 hPa + géopotentiel 500 hPa',
		description: "Circulation synoptique avec température de la masse d'air",
		group: 'Synoptique',
		sources: [
			{ variable: 'temperature_850hPa', raster: true },
			{ variable: 'geopotential_height_500hPa', contours: true, contourInterval: 12.5 }
		]
	},
	{
		id: 'z500_mslp',
		label: 'Géopotentiel 500 hPa + pression mer',
		description: 'Circulation en altitude au-dessus de la pression de surface',
		group: 'Synoptique',
		sources: [
			{
				variable: 'geopotential_height_500hPa',
				raster: true,
				contours: true,
				contourInterval: 12.5
			},
			{ variable: 'pressure_msl', contours: true, contourInterval: 2 }
		]
	},
	{
		id: 'z500_t500',
		label: 'Température 500 hPa + géopotentiel',
		description: 'Température à 500 hPa sous les isohypses',
		group: 'Synoptique',
		sources: [
			{ variable: 'temperature_500hPa', raster: true },
			{ variable: 'geopotential_height_500hPa', contours: true, contourInterval: 12.5 }
		]
	},
	{
		id: 'z300_wind300',
		label: 'Vent 300 hPa + géopotentiel',
		description: 'Vents du niveau du jet et hauteurs à 300 hPa',
		group: 'Synoptique',
		sources: [
			{ variable: 'wind_u_component_300hPa', raster: true, arrows: true, opacity: 0.7 },
			{ variable: 'geopotential_height_300hPa', contours: true, contourInterval: 12.5 }
		]
	},
	{
		id: 'wind200_mslp',
		label: 'Pression mer + vent 200 hPa (jet-stream)',
		description: 'Jet-stream au-dessus de la pression de surface',
		group: 'Synoptique',
		sources: [
			{ variable: 'wind_u_component_200hPa', raster: true, arrows: true, opacity: 0.7 },
			{ variable: 'pressure_msl', contours: true, contourInterval: 2 }
		]
	},
	{
		id: 'wind850_mslp',
		label: 'Pression mer + vent 850 hPa',
		description: 'Vents de basses couches au-dessus de la pression de surface',
		group: 'Synoptique',
		sources: [
			{ variable: 'wind_u_component_850hPa', raster: true, arrows: true, opacity: 0.8 },
			{ variable: 'pressure_msl', contours: true, contourInterval: 2 }
		]
	},
	{
		id: 'rh700_z500',
		label: 'Humidité relative 700 hPa + géopotentiel 500 hPa',
		description: 'Humidité de moyenne altitude avec hauteurs à 500 hPa',
		group: 'Synoptique',
		sources: [
			{ variable: 'relative_humidity_700hPa', raster: true },
			{ variable: 'geopotential_height_500hPa', contours: true, contourInterval: 12.5 }
		]
	},
	{
		id: 'vvel500_z500',
		label: 'Vitesse verticale 500 hPa + géopotentiel',
		description: 'Ascendances et subsidences à 500 hPa',
		group: 'Synoptique',
		sources: [
			{ variable: 'vertical_velocity_500hPa', raster: true },
			{ variable: 'geopotential_height_500hPa', contours: true, contourInterval: 12.5 }
		]
	},
	{
		id: 't850_z850',
		label: 'Température 850 hPa + géopotentiel',
		description: 'Température et hauteurs à 850 hPa',
		group: 'Synoptique',
		sources: [
			{ variable: 'temperature_850hPa', raster: true },
			{ variable: 'geopotential_height_850hPa', contours: true, contourInterval: 12.5 }
		]
	},
	// ── Surface ─────────────────────────────────────────────────────────
	{
		id: 'mslp',
		label: 'Pression au niveau de la mer',
		description: 'Champ de pression de surface avec isobares',
		group: 'Surface',
		sources: [{ variable: 'pressure_msl', raster: true, contours: true, contourInterval: 2 }]
	},
	{
		id: 't2m_wind10m',
		label: 'Température 2 m + vent 10 m',
		description: 'Température et vent en surface',
		group: 'Surface',
		sources: [
			{ variable: 'temperature_2m', raster: true },
			{ variable: 'wind_u_component_10m', arrows: true }
		]
	},
	{
		id: 't2m_mslp',
		label: 'Température 2 m + pression mer',
		description: 'Température en surface avec isobares',
		group: 'Surface',
		sources: [
			{ variable: 'temperature_2m', raster: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 2 }
		]
	},
	{
		id: 'wind100m_mslp',
		label: 'Vent 100 m + pression mer',
		description: 'Vent à hauteur de moyeu au-dessus de la pression de surface',
		group: 'Surface',
		sources: [
			{ variable: 'wind_u_component_100m', raster: true, arrows: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 2 }
		]
	},
	{
		id: 'wind10m_gusts',
		label: 'Rafales de vent 10 m + vent',
		description: 'Intensité des rafales avec direction du vent',
		group: 'Surface',
		sources: [
			{ variable: 'wind_gusts_10m', raster: true },
			{ variable: 'wind_u_component_10m', arrows: true }
		]
	},
	{
		id: 'cape_mslp',
		label: 'CAPE + pression mer',
		description: 'Potentiel orageux avec isobares',
		group: 'Surface',
		sources: [
			{ variable: 'cape', raster: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 2 }
		]
	},
	{
		id: 'tcwv_mslp',
		label: "Contenu intégré en vapeur d'eau + pression mer",
		description: 'Humidité atmosphérique avec isobares',
		group: 'Surface',
		sources: [
			{ variable: 'total_column_integrated_water_vapour', raster: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 2 }
		]
	},
	{
		id: 'cloud_cover',
		label: 'Couverture nuageuse (haute/moyenne/basse)',
		description: 'Couches nuageuses, bleu sur vert sur rouge',
		group: 'Surface',
		// Dessinées de haut en bas pour que la couche basse reste lisible sous
		// les couches supérieures. Chaque niveau a sa propre échelle de couleurs ;
		// les opacités laissent transparaître un niveau à travers ceux du dessous,
		// même à couverture complète.
		sources: [
			{ variable: 'cloud_cover_high', raster: true },
			{ variable: 'cloud_cover_mid', raster: true, opacity: 0.85 },
			{ variable: 'cloud_cover_low', raster: true, opacity: 0.75 }
		]
	},
	// ── Précipitations ──────────────────────────────────────────────────
	{
		id: 'rain_mslp',
		label: 'Précipitations + pression mer',
		description: 'Précipitations avec isobares',
		group: 'Précipitations',
		sources: [
			{ variable: 'precipitation', raster: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 2 }
		]
	},
	{
		id: 'snowfall_mslp',
		label: 'Chutes de neige + pression mer',
		description: 'Chutes de neige avec isobares',
		group: 'Précipitations',
		sources: [
			{ variable: 'snowfall', raster: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 2 }
		]
	},
	{
		id: 'freezing_level',
		label: "Altitude de l'isotherme 0 °C + pression mer",
		description: "Altitude de l'isotherme 0 °C avec isobares",
		group: 'Précipitations',
		sources: [
			{ variable: 'freezing_level_height', raster: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 2 }
		]
	},
	{
		id: 'cloud_rain',
		label: 'Couverture nuageuse + précipitations',
		description: 'Nuages et précipitations',
		group: 'Précipitations',
		sources: [
			{ variable: 'cloud_cover', raster: true },
			{ variable: 'precipitation', raster: true }
		]
	},
	{
		id: 'wind_cloud_rain',
		label: 'Vent + couverture nuageuse + précipitations',
		description: 'Vent (aplat et flèches), nuages et précipitations',
		group: 'Précipitations',
		sources: [
			// inlineVectors (upstream) : flèches dessinées sur le raster de vent, sous
			// les nuages et les précipitations. Ignoré en v1 chez nous : les flèches
			// restent au-dessus des aplats.
			{
				variable: 'wind_u_component_10m',
				raster: true,
				arrows: true,
				inlineVectors: true,
				opacity: 0.7
			},
			{ variable: 'cloud_cover', raster: true, opacity: 0.7 },
			{ variable: 'precipitation', raster: true }
		]
	},
	// ── Infoclimat ──────────────────────────────────────────────────────
	{
		id: 'thetaw850_z500',
		label: "θ'w 850 hPa + géopotentiel 500 hPa",
		description: 'Température potentielle du thermomètre mouillé à 850 hPa avec isohypses 500 hPa',
		group: 'Infoclimat',
		sources: [
			{ variable: 'theta_w_850hPa', raster: true },
			{ variable: 'geopotential_height_500hPa', contours: true, contourInterval: 12.5 }
		]
	},
	{
		id: 'thickness_mslp',
		label: 'Épaisseur 500/1000 hPa + pression mer',
		description: 'Épaisseur de la couche 500/1000 hPa avec isobares',
		group: 'Infoclimat',
		sources: [
			{ variable: 'thickness_500_1000hPa', raster: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 2 }
		]
	}
];

export const getChartPreset = (id: string): ChartPreset | undefined =>
	chartPresets.find((preset) => preset.id === id);
