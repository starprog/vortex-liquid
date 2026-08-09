import { getElementKeyframes } from "@/animation";
import { hasKeyframesForPath } from "@/animation/keyframe-query";
import { resolveNumberAtTime } from "@/animation/values";
import { VOLUME_DB_MAX, VOLUME_DB_MIN } from "./audio-constants";
import type { TimelineElement } from "./types";
const DEFAULT_STEP_SECONDS = 1 / 60;

export type AudioCapableElement = Extract<
	TimelineElement,
	{ type: "audio" | "video" }
>;

export function clampDb(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}

	return Math.min(VOLUME_DB_MAX, Math.max(VOLUME_DB_MIN, value));
}

export function dBToLinear(db: number): number {
	return 10 ** (clampDb(db) / 20);
}

export function getElementVolume({
	element,
}: {
	element: AudioCapableElement;
}): number {
	const value = element.params.volume;
	return typeof value === "number" ? value : 0;
}

export function isElementMuted({
	element,
}: {
	element: AudioCapableElement;
}): boolean {
	return element.params.muted === true;
}

export function hasAnimatedVolume({
	element,
}: {
	element: AudioCapableElement;
}): boolean {
	return hasKeyframesForPath({
		animations: element.animations,
		propertyPath: "volume",
	});
}

import { TICKS_PER_SECOND } from "@/wasm";

export function resolveEffectiveAudioGain({
	element,
	trackMuted = false,
	localTime,
}: {
	element: AudioCapableElement;
	trackMuted?: boolean;
	localTime: number;
}): number {
	if (trackMuted || isElementMuted({ element })) {
		return 0;
	}

	const resolvedDb = resolveNumberAtTime({
		baseValue: getElementVolume({ element }),
		animations: element.animations,
		propertyPath: "volume",
		localTime: Math.round(localTime * TICKS_PER_SECOND),
	});

	return dBToLinear(resolvedDb);
}

export function buildWaveformGainSamples({
	element,
	count,
}: {
	element: AudioCapableElement;
	count: number;
}): number[] {
	const durationSeconds = element.duration / TICKS_PER_SECOND;
	return Array.from({ length: count }, (_, i) => {
		const localTime = ((i + 0.5) / count) * durationSeconds;
		return resolveEffectiveAudioGain({ element, localTime });
	});
}

export function buildAudioGainAutomation({
	element,
	trackMuted = false,
	fromLocalTime,
	toLocalTime,
	stepSeconds = DEFAULT_STEP_SECONDS,
}: {
	element: AudioCapableElement;
	trackMuted?: boolean;
	fromLocalTime: number;
	toLocalTime: number;
	stepSeconds?: number;
}): Array<{ localTime: number; gain: number }> {
	const startTime = Math.max(0, fromLocalTime);
	const endTime = Math.max(startTime, toLocalTime);
	const safeStep =
		Number.isFinite(stepSeconds) && stepSeconds > 0
			? stepSeconds
			: DEFAULT_STEP_SECONDS;

	const sampleAt = (localTime: number) => ({
		localTime,
		gain: resolveEffectiveAudioGain({ element, trackMuted, localTime }),
	});

	const volumeKeyframes = getElementKeyframes({ animations: element.animations })
		.filter((keyframe) => keyframe.propertyPath === "volume")
		.map((keyframe) => ({
			timeSeconds: keyframe.time / TICKS_PER_SECOND,
			interpolation: keyframe.interpolation,
		}))
		.sort((left, right) => left.timeSeconds - right.timeSeconds);

	// Every segment is piecewise-linear (or flat, outside the keyframe range)
	// except "bezier" ones, so sampling just the segment endpoints reproduces
	// the exact same automation curve with far fewer scheduled ramp points —
	// dense resampling is only needed inside the (rare) curved segments.
	const curvedRanges: Array<{ from: number; to: number }> = [];
	for (let index = 0; index < volumeKeyframes.length - 1; index++) {
		if (volumeKeyframes[index].interpolation !== "bezier") {
			continue;
		}
		curvedRanges.push({
			from: Math.max(startTime, volumeKeyframes[index].timeSeconds),
			to: Math.min(endTime, volumeKeyframes[index + 1].timeSeconds),
		});
	}

	const criticalTimes = new Set<number>([startTime, endTime]);
	for (const keyframe of volumeKeyframes) {
		if (keyframe.timeSeconds > startTime && keyframe.timeSeconds < endTime) {
			criticalTimes.add(keyframe.timeSeconds);
		}
	}
	const sortedCriticalTimes = Array.from(criticalTimes).sort((left, right) => left - right);

	const points: Array<{ localTime: number; gain: number }> = [];
	for (let index = 0; index < sortedCriticalTimes.length; index++) {
		const localTime = sortedCriticalTimes[index];
		points.push(sampleAt(localTime));

		const nextTime = sortedCriticalTimes[index + 1];
		if (nextTime === undefined) {
			continue;
		}

		const isCurvedSegment = curvedRanges.some(
			(range) => range.to > range.from && localTime >= range.from && nextTime <= range.to,
		);
		if (!isCurvedSegment) {
			continue;
		}

		for (let denseTime = localTime + safeStep; denseTime < nextTime; denseTime += safeStep) {
			points.push(sampleAt(denseTime));
		}
	}

	return points;
}
