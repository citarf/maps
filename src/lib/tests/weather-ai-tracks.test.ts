import { describe, expect, it } from 'vitest';

import {
	CANDIDATE_LABEL,
	buildTracks,
	classifyTrack,
	tracksToGeoJson,
	unwrapLongitudes
} from '$lib/weather-ai/tracks';

import { RUN_ID, VALID_TIMES, trackPoint, tracksDoc } from './weather-ai-fixtures';

describe('classifyTrack', () => {
	it('distingue cyclones déclarés, candidats de cyclogenèse et formats inconnus', () => {
		expect(classifyTrack('ecmwf-tf:2026:36W')).toEqual({ kind: 'declared', label: '36W' });
		expect(classifyTrack('atcf:wp362026')).toEqual({ kind: 'declared', label: 'wp362026' });
		expect(classifyTrack('cyclogenesis_0')).toEqual({ kind: 'candidate', label: CANDIDATE_LABEL });
		expect(classifyTrack('cyclogenesis_x').kind).toBe('unknown');
		expect(classifyTrack('36W').kind).toBe('unknown');
	});
});

describe('buildTracks', () => {
	it('regroupe par (member, model_track_id) et trie par valid_time', () => {
		const frames = [VALID_TIMES[1], VALID_TIMES[0]].map((vt, k) =>
			tracksDoc(vt, [
				trackPoint({ valid_time: vt, latitude: 10 + k }),
				trackPoint({ valid_time: vt, member: 1, latitude: 20 + k }),
				trackPoint({ valid_time: vt, model_track_id: 'cyclogenesis_3', latitude: 30 + k })
			])
		);
		const tracks = buildTracks(frames, RUN_ID);
		expect(tracks.map((t) => `${t.member}:${t.id}`)).toEqual([
			'0:cyclogenesis_3',
			'0:ecmwf-tf:2026:36W',
			'1:ecmwf-tf:2026:36W'
		]);
		const m0 = tracks.find((t) => t.member === 0 && t.kind === 'declared')!;
		expect(m0.points.map((p) => p.time)).toEqual([VALID_TIMES[0], VALID_TIMES[1]]);
		expect(m0.points.map((p) => p.lat)).toEqual([11, 10]);
	});

	it('refuse de combiner deux runs', () => {
		const frames = [
			tracksDoc(VALID_TIMES[0], []),
			tracksDoc(VALID_TIMES[1], [], { run_id: 'autre' })
		];
		expect(() => buildTracks(frames, RUN_ID)).toThrow(/Run mélangé/);
	});

	it('déroule les longitudes d’une piste qui franchit l’antiméridien', () => {
		expect(unwrapLongitudes([178, -179, -176])).toEqual([178, 181, 184]);
		expect(unwrapLongitudes([-178, 179])).toEqual([-178, -181]);
		const frames = [178, -179].map((lon, k) =>
			tracksDoc(VALID_TIMES[k], [trackPoint({ valid_time: VALID_TIMES[k], longitude: lon })])
		);
		const [t] = buildTracks(frames, RUN_ID);
		expect(t.points.map((p) => p.lon)).toEqual([178, 181]);
	});
});

describe('tracksToGeoJson', () => {
	const frames = VALID_TIMES.map((vt) =>
		tracksDoc(vt, [
			trackPoint({ valid_time: vt }),
			trackPoint({ valid_time: vt, model_track_id: 'cyclogenesis_1' }),
			trackPoint({ valid_time: vt, model_track_id: 'mystery-9' }),
			trackPoint({ valid_time: vt, member: 2 })
		])
	);
	const tracks = buildTracks(frames, RUN_ID);
	const { lines, points } = tracksToGeoJson(tracks, VALID_TIMES[1]);

	it('écarte les pistes de nature inconnue et ne trace que le membre 0', () => {
		expect(lines.features.map((f) => f.properties!.kind).sort()).toEqual(['candidate', 'declared']);
		expect(points.features.every((f) => f.properties!.id !== 'mystery-9')).toBe(true);
		expect(points.features).toHaveLength(6);
	});

	it('marque la position de l’échéance affichée', () => {
		const current = points.features.filter((f) => f.properties!.current);
		expect(current.map((f) => f.properties!.time)).toEqual([VALID_TIMES[1], VALID_TIMES[1]]);
	});

	it('libelle les candidats « Zone à surveiller », jamais comme cyclone', () => {
		const candidate = lines.features.find((f) => f.properties!.kind === 'candidate')!;
		expect(candidate.properties!.label).toBe(CANDIDATE_LABEL);
	});
});
