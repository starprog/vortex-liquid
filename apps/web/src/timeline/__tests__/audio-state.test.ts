import { describe, expect, test } from "bun:test";
import { upsertPathKeyframe } from "@/animation";
import { NUMBER_CHANNEL_LAYOUT } from "@/params";
import { TICKS_PER_SECOND } from "@/wasm";
import { buildAudioGainAutomation, dBToLinear } from "../audio-state";
import type { AudioCapableElement } from "../audio-state";

function buildElement({
	durationSeconds,
	keyframes,
	muted = false,
}: {
	durationSeconds: number;
	keyframes: Array<{ timeSeconds: number; valueDb: number; interpolation?: "linear" | "hold" | "bezier" }>;
	muted?: boolean;
}): AudioCapableElement {
	let animations = undefined;
	for (const keyframe of keyframes) {
		animations = upsertPathKeyframe({
			animations,
			propertyPath: "volume",
			time: Math.round(keyframe.timeSeconds * TICKS_PER_SECOND),
			value: keyframe.valueDb,
			interpolation: keyframe.interpolation ?? "linear",
			channelLayout: NUMBER_CHANNEL_LAYOUT,
			coerceValue: ({ value }) => (typeof value === "number" ? value : null),
		});
	}

	return {
		duration: Math.round(durationSeconds * TICKS_PER_SECOND),
		params: { volume: 0, muted },
		animations,
	} as unknown as AudioCapableElement;
}

describe("buildAudioGainAutomation", () => {
	test("samples only the segment boundaries for an all-linear envelope", () => {
		const element = buildElement({
			durationSeconds: 10,
			keyframes: [
				{ timeSeconds: 0, valueDb: 0 },
				{ timeSeconds: 4, valueDb: -60 },
				{ timeSeconds: 6, valueDb: 0 },
				{ timeSeconds: 10, valueDb: 0 },
			],
		});

		const points = buildAudioGainAutomation({
			element,
			fromLocalTime: 0,
			toLocalTime: 10,
		});

		expect(points.map((point) => point.localTime)).toEqual([0, 4, 6, 10]);
		expect(points[1].gain).toBeCloseTo(dBToLinear(-60), 5);
	});

	test("densely resamples only inside a bezier segment", () => {
		const element = buildElement({
			durationSeconds: 10,
			keyframes: [
				{ timeSeconds: 0, valueDb: 0, interpolation: "bezier" },
				{ timeSeconds: 4, valueDb: -60 },
				{ timeSeconds: 10, valueDb: -60 },
			],
		});

		const points = buildAudioGainAutomation({
			element,
			fromLocalTime: 0,
			toLocalTime: 10,
			stepSeconds: 1,
		});

		const times = points.map((point) => point.localTime);
		// Dense samples (step=1) show up strictly between the curved segment's
		// endpoints (0 and 4), but the flat linear segment (4 to 10) stays sparse.
		expect(times.filter((time) => time > 0 && time < 4).length).toBeGreaterThan(0);
		expect(times).toContain(0);
		expect(times).toContain(4);
		expect(times).toContain(10);
		expect(times.filter((time) => time > 4 && time < 10).length).toBe(0);
	});

	test("returns 0 gain at every point when the element is muted", () => {
		const element = buildElement({
			durationSeconds: 5,
			keyframes: [
				{ timeSeconds: 0, valueDb: 0 },
				{ timeSeconds: 5, valueDb: -60 },
			],
			muted: true,
		});

		const points = buildAudioGainAutomation({
			element,
			fromLocalTime: 0,
			toLocalTime: 5,
		});

		expect(points.every((point) => point.gain === 0)).toBe(true);
	});

	test("falls back to the clip boundaries when there are no keyframes", () => {
		const element = buildElement({ durationSeconds: 3, keyframes: [] });

		const points = buildAudioGainAutomation({
			element,
			fromLocalTime: 0,
			toLocalTime: 3,
		});

		expect(points.map((point) => point.localTime)).toEqual([0, 3]);
	});
});
