"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getElementKeyframes, upsertPathKeyframe } from "@/animation";
import { useEditor } from "@/editor/use-editor";
import {
	getDbFromLinePos,
	getLinePosFromDb,
} from "@/timeline/audio-display";
import { VOLUME_DB_MAX, VOLUME_DB_MIN } from "@/timeline/audio-constants";
import {
	buildAudioGainAutomation,
	getElementVolume,
	hasAnimatedVolume,
} from "@/timeline/audio-state";
import type { AudioElement } from "@/timeline/types";
import type { ElementAnimations } from "@/animation/types";
import { TICKS_PER_SECOND } from "@/wasm";
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
const AUTOMATION_MIN_POINTS = 48;
const AUTOMATION_MAX_POINTS = 120;

type DragStartSnapshot = {
	animations: ElementAnimations | undefined;
};

type ActiveVolumeDrag = {
	pointerId: number;
	mode: "existing" | "new";
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

function getDbFromGain({ gain }: { gain: number }): number {
	if (!Number.isFinite(gain) || gain <= 0) {
		return VOLUME_DB_MIN;
	}

	return clampVolume({ value: 20 * Math.log10(gain) });
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
	const automationPolylinePoints = useMemo(() => {
		if (!hasAnimatedEnvelope) {
			return "";
		}

		const durationSeconds = Math.max(0, element.duration / TICKS_PER_SECOND);
		if (durationSeconds <= 0) {
			return "";
		}

		const sampleCount = clamp({
			value: Math.round(durationSeconds * 24),
			min: AUTOMATION_MIN_POINTS,
			max: AUTOMATION_MAX_POINTS,
		});
		const stepSeconds = durationSeconds / sampleCount;
		const points = buildAudioGainAutomation({
			element: previewElement,
			fromLocalTime: 0,
			toLocalTime: durationSeconds,
			stepSeconds,
		});

		if (points.length === 0) {
			return "";
		}

		return points
			.map(({ localTime, gain }) => {
				const x = (localTime / durationSeconds) * 100;
				const y = getLinePosFromDb({ db: getDbFromGain({ gain }) });
				return `${x},${y}`;
			})
			.join(" ");
	}, [element.duration, hasAnimatedEnvelope, previewElement]);

	const visibleEnvelopePoints = useMemo(() => {
		const duration = Math.max(1, element.duration);
		const baselinePoint = `${0},${getLinePosFromDb({ db: currentVolume })}`;
		if (volumeKeyframes.length === 0) {
			return baselinePoint;
		}

		return [
			baselinePoint,
			...volumeKeyframes.map((keyframe) => {
				const value =
					typeof keyframe.value === "number"
						? clampVolume({ value: keyframe.value })
						: currentVolume;
				const x = (keyframe.time / duration) * 100;
				const y = getLinePosFromDb({ db: value });
				return `${x},${y}`;
			}),
		].join(" ");
	}, [currentVolume, element.duration, volumeKeyframes]);

	const volumeLabel = `${formatNumberForDisplay({
		value: currentVolume,
		fractionDigits: VOLUME_FRACTION_DIGITS,
	})} dB`;

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

			const targetTime = activeDrag.localTime;
			const nextAnimations = upsertPathKeyframe({
				animations: resolvedAnimations,
				propertyPath: "volume",
				time: targetTime,
				value: nextVolume,
				keyframeId:
					activeDrag.mode === "existing" ? activeDrag.keyframeId ?? undefined : undefined,
				interpolation:
					activeDrag.mode === "existing"
						? volumeKeyframes.find((keyframe) => keyframe.id === activeDrag.keyframeId)
								?.interpolation ?? "linear"
						: "linear",
				channelLayout: NUMBER_CHANNEL_LAYOUT,
				coerceValue: ({ value }) => (typeof value === "number" ? value : null),
			});

			setPreviewAnimations(nextAnimations);
			setDisplayVolume(nextVolume);
			hasPreviewedRef.current = true;
			editor.timeline.previewElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						updates: {
							animations: nextAnimations,
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
		[editor, element.id, resolvedAnimations, trackId, volumeKeyframes],
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
			if (!rect) {
				return;
			}

			const nextVolume = getVolumeFromPointer({ clientY, rect });
			setTooltipClientPos({
				x: clientX + TOOLTIP_OFFSET_PX,
				y: clientY - TOOLTIP_OFFSET_PX,
			});
			previewVolume(nextVolume);
		},
		[previewVolume],
	);

	const handleClick = useCallback((event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
	}, []);

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

	const handlePointerDown = useCallback(
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
			const localTime = rect
				? clamp({
						value: Math.round(((event.clientX - rect.left) / Math.max(rect.width, 1)) * element.duration),
						min: 0,
						max: element.duration,
					})
				: 0;
			const startValue = getVolumeFromPointer({ clientY: event.clientY, rect: rect ?? new DOMRect() });
			startDrag({
				pointerId: event.pointerId,
				mode: "new",
				keyframeId: null,
				localTime,
				startValue,
			});
			event.currentTarget.setPointerCapture(event.pointerId);
			updateFromPointer({
				clientX: event.clientX,
				clientY: event.clientY,
			});
		},
		[editor.selection, element.duration, element.id, startDrag, trackId, updateFromPointer],
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
						points={automationPolylinePoints || visibleEnvelopePoints}
						fill="none"
						stroke="rgba(255,255,255,0.82)"
						strokeWidth="0.55"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
				{volumeKeyframes.map((keyframe) => {
					const value =
						typeof keyframe.value === "number"
							? clampVolume({ value: keyframe.value })
							: currentVolume;
					const left = `${(keyframe.time / Math.max(element.duration, 1)) * 100}%`;
					const top = `${getLinePosFromDb({ db: value })}%`;
					return (
						<button
							type="button"
							key={keyframe.id}
							className="pointer-events-auto absolute z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/90 bg-foreground shadow-sm"
							style={{ left, top }}
							onPointerDown={(event) => handleKeyframePointerDown(event, keyframe.id)}
							title="Drag to adjust volume keyframe"
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
						onKeyDown={handleKeyDown}
						onMouseDown={handleMouseDown}
						onPointerDown={handlePointerDown}
						onPointerMove={handlePointerMove}
						onPointerUp={handlePointerUp}
						onPointerCancel={handlePointerCancel}
						onLostPointerCapture={handleLostPointerCapture}
						title="Drag to adjust clip volume"
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
					onKeyDown={handleKeyDown}
					onMouseDown={handleMouseDown}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerCancel={handlePointerCancel}
					onLostPointerCapture={handleLostPointerCapture}
					title="Drag to adjust clip volume"
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
