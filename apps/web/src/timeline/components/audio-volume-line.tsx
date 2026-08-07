"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getElementKeyframes, removeElementKeyframe, upsertPathKeyframe } from "@/animation";
import { useEditor } from "@/editor/use-editor";
import {
	getDbFromLinePos,
	getLinePosFromDb,
} from "@/timeline/audio-display";
import { VOLUME_DB_MAX, VOLUME_DB_MIN } from "@/timeline/audio-constants";
import {
	getElementVolume,
	hasAnimatedVolume,
} from "@/timeline/audio-state";
import {
	buildInitialKeyframeSet,
	classifyKeyframeRole,
	constrainKeyframeDrag,
} from "./audio-volume-keyframe-constraints";
import type { AudioElement } from "@/timeline/types";
import type { ElementAnimations } from "@/animation/types";
import { NUMBER_CHANNEL_LAYOUT } from "@/params";
import {
	clamp,
	formatNumberForDisplay,
	getFractionDigitsForStep,
	isNearlyEqual,
	snapToStep,
} from "@/utils/math";
import { cn } from "@/utils/ui";
import { shouldApplyVolumePreview } from "./audio-volume-preview";

const HIT_AREA_HEIGHT_PX = 14;
const TOOLTIP_OFFSET_PX = 10;
const VOLUME_STEP = 0.1;
const VOLUME_FRACTION_DIGITS = getFractionDigitsForStep({ step: VOLUME_STEP });
// Below this count, both remaining keyframes are boundary anchors and neither can be deleted.
const MIN_KEYFRAMES_BEFORE_BOUNDARY_DELETE = 3;

type DragStartSnapshot = {
	animations: ElementAnimations | undefined;
};

type ActiveVolumeDrag = {
	pointerId: number;
	mode: "existing" | "uniform";
	keyframeId: string | null;
	localTime: number;
	startValue: number;
};

function clampVolume({ value }: { value: number }): number {
	return clamp({
		value: snapToStep({ value, step: VOLUME_STEP }),
		min: VOLUME_DB_MIN,
		max: VOLUME_DB_MAX,
	});
}

function getVolumeFromPointer({
	clientY,
	rect,
}: {
	clientY: number;
	rect: DOMRect;
}): number {
	const clampedOffset = clamp({
		value: clientY - rect.top,
		min: 0,
		max: rect.height,
	});
	const progressPercent =
		rect.height <= 0 ? 0 : (clampedOffset / rect.height) * 100;
	return clampVolume({ value: getDbFromLinePos({ percent: progressPercent }) });
}

export function AudioVolumeLine({
	element,
	trackId,
}: {
	element: AudioElement;
	trackId: string;
}) {
	const editor = useEditor();
	const surfaceRef = useRef<HTMLDivElement>(null);
	const activePointerIdRef = useRef<number | null>(null);
	const dragStartSnapshotRef = useRef<DragStartSnapshot | null>(null);
	const activeDragRef = useRef<ActiveVolumeDrag | null>(null);
	const lastPreviewVolumeRef = useRef(getElementVolume({ element }));
	const hasChangedRef = useRef(false);
	const hasPreviewedRef = useRef(false);
	const [isDragging, setIsDragging] = useState(false);
	const [previewAnimations, setPreviewAnimations] = useState<ElementAnimations | undefined>(
		element.animations,
	);
	const [displayVolume, setDisplayVolume] = useState(getElementVolume({ element }));
	const [tooltipClientPos, setTooltipClientPos] = useState<{
		x: number;
		y: number;
	} | null>(null);

	const resolvedAnimations = previewAnimations ?? element.animations;
	const previewElement = useMemo(
		() => ({ ...element, animations: resolvedAnimations }),
		[element, resolvedAnimations],
	);
	const hasAnimatedEnvelope = hasAnimatedVolume({ element: previewElement });
	const currentVolume = displayVolume;
	const lineTop = `${getLinePosFromDb({ db: currentVolume })}%`;
	const volumeKeyframes = useMemo(() => {
		return getElementKeyframes({ animations: resolvedAnimations })
			.filter((keyframe) => keyframe.propertyPath === "volume")
			.sort((left, right) => left.time - right.time);
	}, [resolvedAnimations]);
	// Straight keyframe-to-keyframe segments, matching Adobe Premiere Pro's clip volume rubber band.
	const envelopePoints = useMemo(() => {
		const duration = Math.max(1, element.duration);
		return volumeKeyframes
			.map((keyframe) => {
				const value =
					typeof keyframe.value === "number"
						? clampVolume({ value: keyframe.value })
						: currentVolume;
				const x = (keyframe.time / duration) * 100;
				const y = getLinePosFromDb({ db: value });
				return `${x},${y}`;
			})
			.join(" ");
	}, [currentVolume, element.duration, volumeKeyframes]);

	const volumeLabel = `${formatNumberForDisplay({
		value: currentVolume,
		fractionDigits: VOLUME_FRACTION_DIGITS,
	})} dB`;

	const commitAnimations = useCallback(
		(nextAnimations: ElementAnimations | undefined) => {
			editor.timeline.previewElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						updates: { animations: nextAnimations },
					},
				],
			});
			editor.timeline.commitPreview();
		},
		[editor, element.id, trackId],
	);

	const coerceVolumeValue = useCallback(
		({ value }: { value: number | string | boolean }) => (typeof value === "number" ? value : null),
		[],
	);

	// The envelope must always span the full clip, edge to edge — backfill real
	// boundary keyframes when older/stray data doesn't already reach time 0/duration.
	const ensureBoundaryAnchors = useCallback(
		(
			animations: ElementAnimations | undefined,
			keyframes: { id: string; time: number; value: unknown }[],
		) => {
			if (keyframes.length === 0) {
				return animations;
			}

			const missingStart = !keyframes.some((keyframe) => keyframe.time <= 0);
			const missingEnd = !keyframes.some((keyframe) => keyframe.time >= element.duration);
			if (!missingStart && !missingEnd) {
				return animations;
			}

			const firstKeyframeValue = keyframes[0].value;
			const lastKeyframeValue = keyframes[keyframes.length - 1].value;
			const firstValue =
				typeof firstKeyframeValue === "number"
					? clampVolume({ value: firstKeyframeValue })
					: currentVolume;
			const lastValue =
				typeof lastKeyframeValue === "number"
					? clampVolume({ value: lastKeyframeValue })
					: currentVolume;

			let nextAnimations = animations;
			if (missingStart) {
				nextAnimations = upsertPathKeyframe({
					animations: nextAnimations,
					propertyPath: "volume",
					time: 0,
					value: firstValue,
					channelLayout: NUMBER_CHANNEL_LAYOUT,
					coerceValue: coerceVolumeValue,
				});
			}
			if (missingEnd) {
				nextAnimations = upsertPathKeyframe({
					animations: nextAnimations,
					propertyPath: "volume",
					time: element.duration,
					value: lastValue,
					channelLayout: NUMBER_CHANNEL_LAYOUT,
					coerceValue: coerceVolumeValue,
				});
			}
			return nextAnimations;
		},
		[coerceVolumeValue, currentVolume, element.duration],
	);

	const hasNormalizedBoundariesRef = useRef(false);
	useEffect(() => {
		if (hasNormalizedBoundariesRef.current || volumeKeyframes.length === 0) {
			return;
		}

		hasNormalizedBoundariesRef.current = true;
		const nextAnimations = ensureBoundaryAnchors(element.animations, volumeKeyframes);
		if (nextAnimations !== element.animations) {
			commitAnimations(nextAnimations);
		}
		// Runs once on mount to heal legacy keyframe data; re-running on every
		// volumeKeyframes change would fight with the commit this effect itself causes.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Uniform (non-keyframed) volume drag on a flat line — never creates a keyframe.
	const previewVolume = useCallback(
		(nextVolume: number) => {
			if (
				!shouldApplyVolumePreview({
					hasPreviewed: hasChangedRef.current,
					nextVolume,
					lastPreviewVolume: lastPreviewVolumeRef.current,
				})
			) {
				return;
			}

			const activeDrag = activeDragRef.current;
			if (!activeDrag) {
				return;
			}

			setDisplayVolume(nextVolume);
			hasPreviewedRef.current = true;
			editor.timeline.previewElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						updates: {
							params: { ...element.params, volume: nextVolume },
						},
					},
				],
			});
			lastPreviewVolumeRef.current = nextVolume;
			hasChangedRef.current = !isNearlyEqual({
				leftValue: activeDrag.startValue,
				rightValue: nextVolume,
			});
		},
		[editor, element.id, element.params, trackId],
	);

	// Existing keyframe drag — time is ignored for boundary keyframes, constrained for interior ones.
	const previewKeyframe = useCallback(
		({ time, value }: { time: number; value: number }) => {
			if (
				!shouldApplyVolumePreview({
					hasPreviewed: hasChangedRef.current,
					nextVolume: value,
					lastPreviewVolume: lastPreviewVolumeRef.current,
				})
			) {
				return;
			}

			const activeDrag = activeDragRef.current;
			if (!activeDrag || activeDrag.mode !== "existing" || !activeDrag.keyframeId) {
				return;
			}

			const constrained = constrainKeyframeDrag({
				keyframes: volumeKeyframes,
				keyframeId: activeDrag.keyframeId,
				duration: element.duration,
				proposedTime: time,
				proposedValue: value,
				valueMin: VOLUME_DB_MIN,
				valueMax: VOLUME_DB_MAX,
			});
			const nextAnimations = upsertPathKeyframe({
				animations: resolvedAnimations,
				propertyPath: "volume",
				time: constrained.time,
				value: constrained.value,
				keyframeId: activeDrag.keyframeId,
				interpolation:
					volumeKeyframes.find((keyframe) => keyframe.id === activeDrag.keyframeId)
						?.interpolation ?? "linear",
				channelLayout: NUMBER_CHANNEL_LAYOUT,
				coerceValue: ({ value: coerced }) => (typeof coerced === "number" ? coerced : null),
			});

			setPreviewAnimations(nextAnimations);
			setDisplayVolume(constrained.value);
			hasPreviewedRef.current = true;
			editor.timeline.previewElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						updates: { animations: nextAnimations },
					},
				],
			});
			lastPreviewVolumeRef.current = constrained.value;
			hasChangedRef.current = !isNearlyEqual({
				leftValue: activeDrag.startValue,
				rightValue: constrained.value,
			});
		},
		[editor, element.duration, element.id, resolvedAnimations, trackId, volumeKeyframes],
	);

	const finishDrag = useCallback(
		({ shouldCommit }: { shouldCommit: boolean }) => {
			activePointerIdRef.current = null;
			setIsDragging(false);

			if (shouldCommit && (hasPreviewedRef.current || hasChangedRef.current)) {
				editor.timeline.commitPreview();
			} else {
				editor.timeline.discardPreview();
			}

			hasChangedRef.current = false;
			hasPreviewedRef.current = false;
			lastPreviewVolumeRef.current = getElementVolume({ element });
			setPreviewAnimations(undefined);
			setDisplayVolume(getElementVolume({ element }));
			setTooltipClientPos(null);
		},
		[editor, element],
	);

	const updateFromPointer = useCallback(
		({ clientX, clientY }: { clientX: number; clientY: number }) => {
			const rect = surfaceRef.current?.getBoundingClientRect();
			const activeDrag = activeDragRef.current;
			if (!rect || !activeDrag) {
				return;
			}

			const nextVolume = getVolumeFromPointer({ clientY, rect });
			setTooltipClientPos({
				x: clientX + TOOLTIP_OFFSET_PX,
				y: clientY - TOOLTIP_OFFSET_PX,
			});

			if (activeDrag.mode === "uniform") {
				previewVolume(nextVolume);
				return;
			}

			const proposedTime = clamp({
				value: Math.round(((clientX - rect.left) / Math.max(rect.width, 1)) * element.duration),
				min: 0,
				max: element.duration,
			});
			previewKeyframe({ time: proposedTime, value: nextVolume });
		},
		[element.duration, previewKeyframe, previewVolume],
	);

	const handleClick = useCallback(
		(event: React.MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			editor.selection.setSelectedElements({
				elements: [{ trackId, elementId: element.id }],
			});
		},
		[editor.selection, element.id, trackId],
	);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (event.key === "ArrowUp" || event.key === "ArrowRight") {
				event.preventDefault();
				event.stopPropagation();
				previewVolume(clampVolume({ value: currentVolume + VOLUME_STEP }));
				return;
			}

			if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
				event.preventDefault();
				event.stopPropagation();
				previewVolume(clampVolume({ value: currentVolume - VOLUME_STEP }));
			}
		},
		[currentVolume, previewVolume],
	);

	const handleMouseDown = useCallback((event: React.MouseEvent) => {
		event.stopPropagation();
	}, []);

	const startDrag = useCallback(
		({
			pointerId,
			mode,
			keyframeId,
			localTime,
			startValue,
		}: {
			pointerId: number;
			mode: ActiveVolumeDrag["mode"];
			keyframeId: string | null;
			localTime: number;
			startValue: number;
		}) => {
			activeDragRef.current = {
				pointerId,
				mode,
				keyframeId,
				localTime,
				startValue,
			};
			dragStartSnapshotRef.current = {
				animations: resolvedAnimations ? structuredClone(resolvedAnimations) : undefined,
			};
			hasChangedRef.current = false;
			hasPreviewedRef.current = false;
			lastPreviewVolumeRef.current = startValue;
			setIsDragging(true);
		},
		[resolvedAnimations],
	);

	// Flat-line (no keyframes) drag — adjusts uniform clip volume only, never creates a keyframe.
	const handleFlatLinePointerDown = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			if (event.button !== 0) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			editor.selection.setSelectedElements({
				elements: [{ trackId, elementId: element.id }],
			});
			activePointerIdRef.current = event.pointerId;
			const rect = surfaceRef.current?.getBoundingClientRect();
			const startValue = getVolumeFromPointer({ clientY: event.clientY, rect: rect ?? new DOMRect() });
			startDrag({
				pointerId: event.pointerId,
				mode: "uniform",
				keyframeId: null,
				localTime: 0,
				startValue,
			});
			event.currentTarget.setPointerCapture(event.pointerId);
			updateFromPointer({
				clientX: event.clientX,
				clientY: event.clientY,
			});
		},
		[editor.selection, element.id, startDrag, trackId, updateFromPointer],
	);

	// Double-click adds a keyframe: the first add anchors both clip start/end plus the clicked point.
	const handleEnvelopeDoubleClick = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			event.preventDefault();
			event.stopPropagation();
			const rect = surfaceRef.current?.getBoundingClientRect();
			if (!rect) {
				return;
			}

			editor.selection.setSelectedElements({
				elements: [{ trackId, elementId: element.id }],
			});
			const clickTime = clamp({
				value: Math.round(((event.clientX - rect.left) / Math.max(rect.width, 1)) * element.duration),
				min: 0,
				max: element.duration,
			});
			const clickValue = getVolumeFromPointer({ clientY: event.clientY, rect });

			if (volumeKeyframes.length === 0) {
				const { start, interior, end } = buildInitialKeyframeSet({
					clickTime,
					clickValue,
					duration: element.duration,
					currentVolume,
				});
				let nextAnimations = upsertPathKeyframe({
					animations: resolvedAnimations,
					propertyPath: "volume",
					time: start.time,
					value: start.value,
					channelLayout: NUMBER_CHANNEL_LAYOUT,
					coerceValue: coerceVolumeValue,
				});
				nextAnimations = upsertPathKeyframe({
					animations: nextAnimations,
					propertyPath: "volume",
					time: interior.time,
					value: interior.value,
					channelLayout: NUMBER_CHANNEL_LAYOUT,
					coerceValue: coerceVolumeValue,
				});
				nextAnimations = upsertPathKeyframe({
					animations: nextAnimations,
					propertyPath: "volume",
					time: end.time,
					value: end.value,
					channelLayout: NUMBER_CHANNEL_LAYOUT,
					coerceValue: coerceVolumeValue,
				});
				commitAnimations(nextAnimations);
				return;
			}

			const anchoredAnimations = ensureBoundaryAnchors(resolvedAnimations, volumeKeyframes);
			const anchoredKeyframes = getElementKeyframes({ animations: anchoredAnimations })
				.filter((keyframe) => keyframe.propertyPath === "volume")
				.map((keyframe) => ({ id: keyframe.id, time: keyframe.time }));

			const pendingId = "__pending-keyframe__";
			const withPending = [...anchoredKeyframes, { id: pendingId, time: clickTime }];
			const constrained = constrainKeyframeDrag({
				keyframes: withPending,
				keyframeId: pendingId,
				duration: element.duration,
				proposedTime: clickTime,
				proposedValue: clickValue,
				valueMin: VOLUME_DB_MIN,
				valueMax: VOLUME_DB_MAX,
			});
			const nextAnimations = upsertPathKeyframe({
				animations: anchoredAnimations,
				propertyPath: "volume",
				time: constrained.time,
				value: constrained.value,
				channelLayout: NUMBER_CHANNEL_LAYOUT,
				coerceValue: coerceVolumeValue,
			});
			commitAnimations(nextAnimations);
		},
		[
			coerceVolumeValue,
			commitAnimations,
			currentVolume,
			editor.selection,
			element.duration,
			element.id,
			ensureBoundaryAnchors,
			resolvedAnimations,
			trackId,
			volumeKeyframes,
		],
	);

	const handlePointerMove = useCallback(
		(event: React.PointerEvent) => {
			if (activePointerIdRef.current !== event.pointerId) {
				return;
			}

			event.preventDefault();
			updateFromPointer({
				clientX: event.clientX,
				clientY: event.clientY,
			});
		},
		[updateFromPointer],
	);

	const handleKeyframePointerDown = useCallback(
		(event: React.PointerEvent<HTMLButtonElement>, keyframeId: string) => {
			if (event.button !== 0) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			const keyframe = volumeKeyframes.find((candidate) => candidate.id === keyframeId);
			if (!keyframe) {
				return;
			}

			const startValue =
				typeof keyframe.value === "number"
					? clampVolume({ value: keyframe.value })
					: currentVolume;
			const localTime = keyframe.time;
			activePointerIdRef.current = event.pointerId;
			startDrag({
				pointerId: event.pointerId,
				mode: "existing",
				keyframeId,
				localTime,
				startValue,
			});
			event.currentTarget.setPointerCapture(event.pointerId);
			updateFromPointer({
				clientX: event.clientX,
				clientY: event.clientY,
			});
		},
		[currentVolume, startDrag, updateFromPointer, volumeKeyframes],
	);

	// Right-click removes an interior keyframe; boundary anchors are protected once 3+ keyframes exist.
	const handleKeyframeContextMenu = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>, keyframeId: string) => {
			event.preventDefault();
			event.stopPropagation();

			const role = classifyKeyframeRole({ keyframes: volumeKeyframes, keyframeId });
			const isBoundary = role === "boundary-start" || role === "boundary-end";
			if (isBoundary && volumeKeyframes.length >= MIN_KEYFRAMES_BEFORE_BOUNDARY_DELETE) {
				return;
			}

			const nextAnimations = removeElementKeyframe({
				animations: resolvedAnimations,
				propertyPath: "volume",
				keyframeId,
			});
			commitAnimations(nextAnimations);
		},
		[commitAnimations, resolvedAnimations, volumeKeyframes],
	);

	const handlePointerUp = useCallback(
		(event: React.PointerEvent) => {
			if (activePointerIdRef.current !== event.pointerId) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			finishDrag({ shouldCommit: true });
		},
		[finishDrag],
	);

	useEffect(() => {
		const handleWindowPointerMove = (event: PointerEvent) => {
			if (activePointerIdRef.current !== event.pointerId) {
				return;
			}

			updateFromPointer({
				clientX: event.clientX,
				clientY: event.clientY,
			});
		};

		const handleWindowPointerUp = (event: PointerEvent) => {
			if (activePointerIdRef.current !== event.pointerId) {
				return;
			}

			finishDrag({ shouldCommit: true });
		};

		const handleWindowPointerCancel = (event: PointerEvent) => {
			if (activePointerIdRef.current !== event.pointerId) {
				return;
			}

			finishDrag({ shouldCommit: false });
		};

		window.addEventListener("pointermove", handleWindowPointerMove);
		window.addEventListener("pointerup", handleWindowPointerUp);
		window.addEventListener("pointercancel", handleWindowPointerCancel);

		return () => {
			window.removeEventListener("pointermove", handleWindowPointerMove);
			window.removeEventListener("pointerup", handleWindowPointerUp);
			window.removeEventListener("pointercancel", handleWindowPointerCancel);
		};
	}, [finishDrag, updateFromPointer]);

	const handlePointerCancel = useCallback(
		(event: React.PointerEvent) => {
			if (activePointerIdRef.current !== event.pointerId) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			finishDrag({ shouldCommit: false });
		},
		[finishDrag],
	);

	const handleLostPointerCapture = useCallback(() => {
		if (activePointerIdRef.current === null) {
			return;
		}

		finishDrag({ shouldCommit: hasChangedRef.current });
	}, [finishDrag]);

	if (hasAnimatedEnvelope || volumeKeyframes.length > 0) {
		return (
			<div className="pointer-events-none absolute inset-0">
				<svg
					className="absolute inset-0 h-full w-full"
					viewBox="0 0 100 100"
					preserveAspectRatio="none"
				>
					<polyline
						points={envelopePoints}
						fill="none"
						stroke="rgba(255,255,255,0.82)"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
						vectorEffect="non-scaling-stroke"
					/>
				</svg>
				{volumeKeyframes.map((keyframe) => {
					const value =
						typeof keyframe.value === "number"
							? clampVolume({ value: keyframe.value })
							: currentVolume;
					const left = `${(keyframe.time / Math.max(element.duration, 1)) * 100}%`;
					const top = `${getLinePosFromDb({ db: value })}%`;
					const role = classifyKeyframeRole({ keyframes: volumeKeyframes, keyframeId: keyframe.id });
					return (
						<button
							type="button"
							key={keyframe.id}
							className={cn(
								"pointer-events-auto absolute z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/90 bg-foreground shadow-sm",
								role === "interior" ? "cursor-move" : "cursor-ns-resize",
							)}
							style={{ left, top }}
							onPointerDown={(event) => handleKeyframePointerDown(event, keyframe.id)}
							onContextMenu={(event) => handleKeyframeContextMenu(event, keyframe.id)}
							title={
								role === "interior"
									? "Drag to adjust volume keyframe · right-click to remove"
									: "Drag to adjust volume"
							}
						/>
					);
				})}
				<div ref={surfaceRef} className="pointer-events-auto absolute inset-0">
					<div
						className="absolute inset-0 touch-none cursor-ns-resize"
						role="slider"
						aria-orientation="vertical"
						aria-valuemin={VOLUME_DB_MIN}
						aria-valuemax={VOLUME_DB_MAX}
						aria-valuenow={currentVolume}
						tabIndex={0}
						onClick={handleClick}
						onDoubleClick={handleEnvelopeDoubleClick}
						onKeyDown={handleKeyDown}
						onMouseDown={handleMouseDown}
						onPointerMove={handlePointerMove}
						onPointerUp={handlePointerUp}
						onPointerCancel={handlePointerCancel}
						onLostPointerCapture={handleLostPointerCapture}
						title="Double-click to add a volume keyframe"
					/>
				</div>
				{isDragging &&
					tooltipClientPos &&
					createPortal(
						<div
							className="pointer-events-none fixed left-0 top-0 z-50 -translate-y-full rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap"
							style={{
								transform: `translate(${tooltipClientPos.x}px, ${tooltipClientPos.y}px)`,
							}}
						>
							{volumeLabel}
						</div>,
						document.body,
					)}
			</div>
		);
	}

	return (
		<div className="pointer-events-none absolute inset-0">
			<div ref={surfaceRef} className="absolute inset-0">
				<div
					className={cn(
						"pointer-events-none absolute inset-x-0 -translate-y-1/2 border-t transition-colors",
						isDragging
							? "border-white"
							: "border-white/50 group-hover/audio:border-white/80",
					)}
					style={{ top: lineTop, borderTopWidth: "0.5px" }}
				/>
				<div
					className="absolute inset-x-0 -translate-y-1/2 touch-none cursor-ns-resize pointer-events-auto"
					style={{ top: lineTop, height: `${HIT_AREA_HEIGHT_PX}px` }}
					role="slider"
					aria-orientation="vertical"
					aria-valuemin={VOLUME_DB_MIN}
					aria-valuemax={VOLUME_DB_MAX}
					aria-valuenow={currentVolume}
					tabIndex={0}
					onClick={handleClick}
					onDoubleClick={handleEnvelopeDoubleClick}
					onKeyDown={handleKeyDown}
					onMouseDown={handleMouseDown}
					onPointerDown={handleFlatLinePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerCancel={handlePointerCancel}
					onLostPointerCapture={handleLostPointerCapture}
					title="Drag to adjust clip volume · double-click to add a keyframe"
				/>
				{isDragging &&
					tooltipClientPos &&
					createPortal(
						<div
							className="pointer-events-none fixed left-0 top-0 z-50 -translate-y-full rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap"
							style={{
								transform: `translate(${tooltipClientPos.x}px, ${tooltipClientPos.y}px)`,
							}}
						>
							{volumeLabel}
						</div>,
						document.body,
					)}
			</div>
		</div>
	);
}
