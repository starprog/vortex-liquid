"use client";

import { useEffect, useRef, useCallback } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { effectsRegistry, EFFECT_TARGET_ELEMENT_TYPES } from "@/effects";
import { effectPreviewService } from "@/services/renderer/effect-preview";
import { useEditor } from "@/editor/use-editor";
import { buildEffectElement } from "@/timeline/element-utils";
import type { EffectDefinition } from "@/effects/types";
import { isVisualElement } from "@/timeline/element-utils";
import { mediaTimeFromSeconds } from "@/wasm";
import { usePropertiesStore } from "@/components/editor/panels/properties/stores/properties-store";
import { toast } from "sonner";

export function EffectsView() {
	const effects = effectsRegistry.getAll();

	return (
		<PanelView title="Effects">
			<EffectsGrid effects={effects} />
		</PanelView>
	);
}

function EffectsGrid({ effects }: { effects: EffectDefinition[] }) {
	return (
		<div
			className="grid gap-2"
			style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}
		>
			{effects.map((effect) => (
				<EffectItem key={effect.type} effect={effect} />
			))}
		</div>
	);
}

function EffectPreviewCanvas({ effectType }: { effectType: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const render = () => {
			if (canvasRef.current) {
				effectPreviewService.renderPreview({
					effectType,
					params: {},
					targetCanvas: canvasRef.current,
				});
			}
		};

		render();
		return effectPreviewService.onPreviewImageReady({ callback: render });
	}, [effectType]);

	return <canvas ref={canvasRef} className="size-full" />;
}

function EffectItem({ effect }: { effect: EffectDefinition }) {
	const editor = useEditor();
	const setActivePropertiesTab = usePropertiesStore((s) => s.setActiveTab);
	const selectedVisual = useEditor((currentEditor) => {
		const selected = currentEditor.selection.getSelectedElements();
		const matched = currentEditor.timeline.getElementsWithTracks({
			elements: selected,
		});
		return matched.find(({ element }) => isVisualElement(element)) ?? null;
	});

	const handleAddToTimeline = useCallback(() => {
		try {
			if (selectedVisual) {
				editor.timeline.addClipEffect({
					trackId: selectedVisual.track.id,
					elementId: selectedVisual.element.id,
					effectType: effect.type,
				});
				setActivePropertiesTab({
					elementType: selectedVisual.element.type,
					tabId: "effects",
				});
				return;
			}

			const currentTime = editor.playback.getCurrentTime();
			const element = buildEffectElement({
				effectType: effect.type,
				startTime: currentTime,
				duration: mediaTimeFromSeconds({ seconds: 2 }),
			});

			editor.timeline.insertElement({
				placement: { mode: "auto", trackType: "effect" },
				element,
			});
			setActivePropertiesTab({ elementType: "effect", tabId: "effects" });
		} catch (error) {
			console.error("Failed to add effect:", error);
			toast.error("Could not apply effect to this layer.");
		}
	}, [editor, effect.type, selectedVisual, setActivePropertiesTab]);

	const preview = <EffectPreviewCanvas effectType={effect.type} />;

	return (
		<DraggableItem
			name={effect.name}
			preview={preview}
			dragData={{
				id: effect.type,
				name: effect.name,
				type: "effect",
				effectType: effect.type,
				targetElementTypes: EFFECT_TARGET_ELEMENT_TYPES,
			}}
			onAddToTimeline={handleAddToTimeline}
			aspectRatio={1}
			isRounded
			variant="card"
			containerClassName="w-full"
		/>
	);
}
