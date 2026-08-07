import { clamp } from "@/utils/math";

// Minimum gap (in ticks) enforced between adjacent keyframes so segments never collapse to zero width.
const MIN_KEYFRAME_GAP_TICKS = 1;

export type KeyframeRole = "boundary-start" | "boundary-end" | "interior";

export interface KeyframeTimeRef {
	id: string;
	time: number;
}

export interface KeyframeDragPoint {
	time: number;
	value: number;
}

function sortByTime<T extends KeyframeTimeRef>(keyframes: readonly T[]): T[] {
	return [...keyframes].sort((left, right) => left.time - right.time);
}

// With a single keyframe there is no "end" yet, so it's treated as the start anchor.
export function classifyKeyframeRole({
	keyframes,
	keyframeId,
}: {
	keyframes: readonly KeyframeTimeRef[];
	keyframeId: string;
}): KeyframeRole {
	const sorted = sortByTime(keyframes);
	if (sorted.length === 0) {
		return "interior";
	}
	if (sorted[0].id === keyframeId) {
		return "boundary-start";
	}
	if (sorted[sorted.length - 1].id === keyframeId) {
		return "boundary-end";
	}
	return "interior";
}

export function constrainKeyframeDrag({
	keyframes,
	keyframeId,
	duration,
	proposedTime,
	proposedValue,
	valueMin,
	valueMax,
}: {
	keyframes: readonly KeyframeTimeRef[];
	keyframeId: string;
	duration: number;
	proposedTime: number;
	proposedValue: number;
	valueMin: number;
	valueMax: number;
}): KeyframeDragPoint {
	const value = clamp({ value: proposedValue, min: valueMin, max: valueMax });
	const role = classifyKeyframeRole({ keyframes, keyframeId });

	if (role === "boundary-start") {
		return { time: 0, value };
	}
	if (role === "boundary-end") {
		return { time: duration, value };
	}

	const sorted = sortByTime(keyframes);
	const index = sorted.findIndex((keyframe) => keyframe.id === keyframeId);
	const previous = sorted[index - 1];
	const next = sorted[index + 1];
	const minTime = previous ? previous.time + MIN_KEYFRAME_GAP_TICKS : 0;
	const maxTime = next ? next.time - MIN_KEYFRAME_GAP_TICKS : duration;
	const time = clamp({
		value: proposedTime,
		min: Math.min(minTime, maxTime),
		max: Math.max(minTime, maxTime),
	});

	return { time, value };
}

export function buildInitialKeyframeSet({
	clickTime,
	clickValue,
	duration,
	currentVolume,
}: {
	clickTime: number;
	clickValue: number;
	duration: number;
	currentVolume: number;
}): { start: KeyframeDragPoint; interior: KeyframeDragPoint; end: KeyframeDragPoint } {
	const innerMax = Math.max(duration - MIN_KEYFRAME_GAP_TICKS, MIN_KEYFRAME_GAP_TICKS);
	const clampedClickTime = clamp({
		value: clickTime,
		min: MIN_KEYFRAME_GAP_TICKS,
		max: innerMax,
	});

	return {
		start: { time: 0, value: currentVolume },
		interior: { time: clampedClickTime, value: clickValue },
		end: { time: duration, value: currentVolume },
	};
}
