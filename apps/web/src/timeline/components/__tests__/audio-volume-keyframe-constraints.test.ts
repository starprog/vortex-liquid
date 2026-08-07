import { describe, expect, test } from "bun:test";
import {
	buildInitialKeyframeSet,
	classifyKeyframeRole,
	constrainKeyframeDrag,
} from "../audio-volume-keyframe-constraints";

const DURATION = 1000;

describe("classifyKeyframeRole", () => {
	test("returns interior when there are no keyframes", () => {
		expect(classifyKeyframeRole({ keyframes: [], keyframeId: "a" })).toBe(
			"interior",
		);
	});

	test("treats a single keyframe as the start anchor", () => {
		const keyframes = [{ id: "a", time: 500 }];
		expect(classifyKeyframeRole({ keyframes, keyframeId: "a" })).toBe(
			"boundary-start",
		);
	});

	test("classifies the earliest and latest of two keyframes as boundaries", () => {
		const keyframes = [
			{ id: "a", time: 0 },
			{ id: "b", time: DURATION },
		];
		expect(classifyKeyframeRole({ keyframes, keyframeId: "a" })).toBe(
			"boundary-start",
		);
		expect(classifyKeyframeRole({ keyframes, keyframeId: "b" })).toBe(
			"boundary-end",
		);
	});

	test("classifies keyframes between the first and last as interior", () => {
		const keyframes = [
			{ id: "a", time: 0 },
			{ id: "b", time: 300 },
			{ id: "c", time: 700 },
			{ id: "d", time: DURATION },
		];
		expect(classifyKeyframeRole({ keyframes, keyframeId: "b" })).toBe(
			"interior",
		);
		expect(classifyKeyframeRole({ keyframes, keyframeId: "c" })).toBe(
			"interior",
		);
	});

	test("is unaffected by input ordering", () => {
		const keyframes = [
			{ id: "c", time: 700 },
			{ id: "a", time: 0 },
			{ id: "d", time: DURATION },
			{ id: "b", time: 300 },
		];
		expect(classifyKeyframeRole({ keyframes, keyframeId: "a" })).toBe(
			"boundary-start",
		);
		expect(classifyKeyframeRole({ keyframes, keyframeId: "d" })).toBe(
			"boundary-end",
		);
	});
});

describe("constrainKeyframeDrag", () => {
	const keyframes = [
		{ id: "start", time: 0 },
		{ id: "mid", time: 500 },
		{ id: "end", time: DURATION },
	];

	test("locks the start keyframe to time 0 regardless of proposed time", () => {
		const result = constrainKeyframeDrag({
			keyframes,
			keyframeId: "start",
			duration: DURATION,
			proposedTime: 250,
			proposedValue: -6,
			valueMin: -60,
			valueMax: 20,
		});
		expect(result.time).toBe(0);
		expect(result.value).toBe(-6);
	});

	test("locks the end keyframe to the clip duration regardless of proposed time", () => {
		const result = constrainKeyframeDrag({
			keyframes,
			keyframeId: "end",
			duration: DURATION,
			proposedTime: 250,
			proposedValue: 3,
			valueMin: -60,
			valueMax: 20,
		});
		expect(result.time).toBe(DURATION);
		expect(result.value).toBe(3);
	});

	test("allows an interior keyframe to move freely between its neighbors", () => {
		const result = constrainKeyframeDrag({
			keyframes,
			keyframeId: "mid",
			duration: DURATION,
			proposedTime: 420,
			proposedValue: -10,
			valueMin: -60,
			valueMax: 20,
		});
		expect(result.time).toBe(420);
		expect(result.value).toBe(-10);
	});

	test("clamps an interior keyframe so it cannot cross its left neighbor", () => {
		const result = constrainKeyframeDrag({
			keyframes,
			keyframeId: "mid",
			duration: DURATION,
			proposedTime: -50,
			proposedValue: 0,
			valueMin: -60,
			valueMax: 20,
		});
		expect(result.time).toBe(1);
	});

	test("clamps an interior keyframe so it cannot cross its right neighbor", () => {
		const result = constrainKeyframeDrag({
			keyframes,
			keyframeId: "mid",
			duration: DURATION,
			proposedTime: 5000,
			proposedValue: 0,
			valueMin: -60,
			valueMax: 20,
		});
		expect(result.time).toBe(DURATION - 1);
	});

	test("clamps the value to the provided min/max", () => {
		const result = constrainKeyframeDrag({
			keyframes,
			keyframeId: "mid",
			duration: DURATION,
			proposedTime: 500,
			proposedValue: 100,
			valueMin: -60,
			valueMax: 20,
		});
		expect(result.value).toBe(20);
	});
});

describe("buildInitialKeyframeSet", () => {
	test("anchors start and end at the current volume and places the interior point at the click", () => {
		const result = buildInitialKeyframeSet({
			clickTime: 400,
			clickValue: -12,
			duration: DURATION,
			currentVolume: -3,
		});
		expect(result.start).toEqual({ time: 0, value: -3 });
		expect(result.end).toEqual({ time: DURATION, value: -3 });
		expect(result.interior).toEqual({ time: 400, value: -12 });
	});

	test("keeps the interior point away from the anchors when clicked near the edges", () => {
		const result = buildInitialKeyframeSet({
			clickTime: 0,
			clickValue: -12,
			duration: DURATION,
			currentVolume: -3,
		});
		expect(result.interior.time).toBeGreaterThan(0);

		const resultAtEnd = buildInitialKeyframeSet({
			clickTime: DURATION,
			clickValue: -12,
			duration: DURATION,
			currentVolume: -3,
		});
		expect(resultAtEnd.interior.time).toBeLessThan(DURATION);
	});
});
