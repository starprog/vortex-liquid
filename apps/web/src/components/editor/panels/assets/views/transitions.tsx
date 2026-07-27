"use client";

import { useCallback } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { useEditor } from "@/editor/use-editor";
import { isVisualElement } from "@/timeline/element-utils";
import { mediaTime, mediaTimeFromSeconds, ZERO_MEDIA_TIME, type MediaTime } from "@/wasm";

interface TransitionPreset {
	id:
		| "fade-in"
		| "fade-out"
		| "fade-in-out"
		| "slide-up-in"
		| "zoom-pulse"
		| "dreamy-blur"
		| "motion-blur-horizontal";
	name: string;
	description: string;
}

const TRANSITION_PRESETS: TransitionPreset[] = [
	{
		id: "fade-in",
		name: "Fade In",
		description: "Smooth entrance from transparent to full opacity.",
	},
	{
		id: "fade-out",
		name: "Fade Out",
		description: "Clean exit by fading to transparent.",
	},
	{
		id: "fade-in-out",
		name: "Fade In + Out",
		description: "Adds a soft intro and outro in one click.",
	},
	{
		id: "slide-up-in",
		name: "Slide Up In",
		description: "Moves the layer upward into place with a smooth fade.",
	},
	{
		id: "zoom-pulse",
		name: "Zoom Pulse",
		description: "Quick punch-in then settle to normal scale.",
	},
	{
		id: "dreamy-blur",
		name: "Dreamy Blur Overlay",
		description: "Adds a soft blur layer transition at the current playhead.",
	},
	{
		id: "motion-blur-horizontal",
		name: "Horizontal Motion Blur",
		description: "Adds directional blur to emphasize fast movement.",
	},
];

function getTransitionDuration({ elementDuration }: { elementDuration: MediaTime }): MediaTime {
	const desired = mediaTimeFromSeconds({ seconds: 0.6 });
	const halfDuration = mediaTime({ ticks: Math.max(1, Math.floor(elementDuration / 2)) });
	return mediaTime({ ticks: Math.max(1, Math.min(desired, halfDuration)) });
}

function readNumericParam({
	element,
	key,
	fallback,
}: {
	element: { params?: Record<string, unknown> };
	key: string;
	fallback: number;
}): number {
	const value = element.params?.[key];
	const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
	return Number.isFinite(parsed) ? parsed : fallback;
}

export function TransitionsView() {
	const editor = useEditor();
	const selectedVisual = useEditor((e) => {
		const selected = e.selection.getSelectedElements();
		const matched = e.timeline.getElementsWithTracks({ elements: selected });
		return matched.find(({ element }) => isVisualElement(element)) ?? null;
	});

	const applyPreset = useCallback(
		(preset: TransitionPreset) => {
			if (!selectedVisual) {
				return;
			}

			const { track, element } = selectedVisual;
			if (!isVisualElement(element)) {
				return;
			}

			if (preset.id === "dreamy-blur" || preset.id === "motion-blur-horizontal") {
				editor.timeline.addClipEffect({
					trackId: track.id,
					elementId: element.id,
					effectType:
						preset.id === "dreamy-blur"
							? "dreamy-blur"
							: "motion-blur-horizontal",
				});
				return;
			}

			const transitionDuration = getTransitionDuration({
				elementDuration: element.duration,
			});
			const elementEnd = mediaTime({
				ticks: Math.max(1, element.duration - 1),
			});
			const fadeOutStart = mediaTime({
				ticks: Math.max(0, elementEnd - transitionDuration),
			});

			if (preset.id === "fade-in") {
				editor.timeline.upsertKeyframes({
					keyframes: [
						{
							trackId: track.id,
							elementId: element.id,
							propertyPath: "opacity",
							time: ZERO_MEDIA_TIME,
							value: 0,
							interpolation: "linear",
						},
						{
							trackId: track.id,
							elementId: element.id,
							propertyPath: "opacity",
							time: transitionDuration,
							value: 1,
							interpolation: "linear",
						},
					],
				});
				return;
			}

			if (preset.id === "fade-out") {
				editor.timeline.upsertKeyframes({
					keyframes: [
						{
							trackId: track.id,
							elementId: element.id,
							propertyPath: "opacity",
							time: fadeOutStart,
							value: 1,
							interpolation: "linear",
						},
						{
							trackId: track.id,
							elementId: element.id,
							propertyPath: "opacity",
							time: elementEnd,
							value: 0,
							interpolation: "linear",
						},
					],
				});
				return;
			}

			if (preset.id === "slide-up-in") {
				const baseOpacity = readNumericParam({
					element,
					key: "opacity",
					fallback: 1,
				});
				const baseY = readNumericParam({
					element,
					key: "transform.positionY",
					fallback: 0,
				});
				editor.timeline.upsertKeyframes({
					keyframes: [
						{
							trackId: track.id,
							elementId: element.id,
							propertyPath: "opacity",
							time: ZERO_MEDIA_TIME,
							value: 0,
							interpolation: "linear",
						},
						{
							trackId: track.id,
							elementId: element.id,
							propertyPath: "opacity",
							time: transitionDuration,
							value: baseOpacity,
							interpolation: "linear",
						},
						{
							trackId: track.id,
							elementId: element.id,
							propertyPath: "transform.positionY",
							time: ZERO_MEDIA_TIME,
							value: baseY + 180,
							interpolation: "linear",
						},
						{
							trackId: track.id,
							elementId: element.id,
							propertyPath: "transform.positionY",
							time: transitionDuration,
							value: baseY,
							interpolation: "linear",
						},
					],
				});
				return;
			}

			if (preset.id === "zoom-pulse") {
				const baseScaleX = readNumericParam({
					element,
					key: "transform.scaleX",
					fallback: 1,
				});
				const baseScaleY = readNumericParam({
					element,
					key: "transform.scaleY",
					fallback: 1,
				});
				const midTime = mediaTime({
					ticks: Math.max(1, Math.floor(transitionDuration / 2)),
				});

				editor.timeline.upsertKeyframes({
					keyframes: [
						{
							trackId: track.id,
							elementId: element.id,
							propertyPath: "transform.scaleX",
							time: ZERO_MEDIA_TIME,
							value: baseScaleX,
							interpolation: "linear",
						},
						{
							trackId: track.id,
							elementId: element.id,
							propertyPath: "transform.scaleX",
							time: midTime,
							value: baseScaleX * 1.14,
							interpolation: "linear",
						},
						{
							trackId: track.id,
							elementId: element.id,
							propertyPath: "transform.scaleX",
							time: transitionDuration,
							value: baseScaleX,
							interpolation: "linear",
						},
						{
							trackId: track.id,
							elementId: element.id,
							propertyPath: "transform.scaleY",
							time: ZERO_MEDIA_TIME,
							value: baseScaleY,
							interpolation: "linear",
						},
						{
							trackId: track.id,
							elementId: element.id,
							propertyPath: "transform.scaleY",
							time: midTime,
							value: baseScaleY * 1.14,
							interpolation: "linear",
						},
						{
							trackId: track.id,
							elementId: element.id,
							propertyPath: "transform.scaleY",
							time: transitionDuration,
							value: baseScaleY,
							interpolation: "linear",
						},
					],
				});
				return;
			}

			editor.timeline.upsertKeyframes({
				keyframes: [
					{
						trackId: track.id,
						elementId: element.id,
						propertyPath: "opacity",
						time: ZERO_MEDIA_TIME,
						value: 0,
						interpolation: "linear",
					},
					{
						trackId: track.id,
						elementId: element.id,
						propertyPath: "opacity",
						time: transitionDuration,
						value: 1,
						interpolation: "linear",
					},
					{
						trackId: track.id,
						elementId: element.id,
						propertyPath: "opacity",
						time: fadeOutStart,
						value: 1,
						interpolation: "linear",
					},
					{
						trackId: track.id,
						elementId: element.id,
						propertyPath: "opacity",
						time: elementEnd,
						value: 0,
						interpolation: "linear",
					},
				],
			});
		},
		[editor, selectedVisual],
	);

	return (
		<PanelView title="Transitions">
			<div className="space-y-2 p-1">
				{TRANSITION_PRESETS.map((preset) => (
					<button
						key={preset.id}
						type="button"
						onClick={() => applyPreset(preset)}
						disabled={!selectedVisual}
						className="w-full rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
					>
						<div className="text-sm font-medium">{preset.name}</div>
						<div className="text-muted-foreground mt-0.5 text-xs">
							{preset.description}
						</div>
					</button>
				))}
				{!selectedVisual && (
					<div className="text-muted-foreground px-1 pt-2 text-xs">
						Select an image, video, sticker, graphic, or text layer to apply transitions.
					</div>
				)}
			</div>
		</PanelView>
	);
}
