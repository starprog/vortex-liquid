"use client";

import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { ElementParamsTab } from "@/components/editor/panels/properties/components/element-params-tab";
import { useEditor } from "@/editor/use-editor";
import { getElementParams } from "@/params/registry";
import type { TimelineElement } from "@/timeline";

function getSuggestedParamKeys({ element }: { element: TimelineElement }): string[] {
	switch (element.type) {
		case "video":
			return [
				"opacity",
				"transform.scaleX",
				"transform.scaleY",
				"transform.rotate",
				"blendMode",
				"volume",
				"muted",
			];
		case "audio":
			return ["volume", "muted"];
		case "text":
			return [
				"fontSize",
				"lineHeight",
				"letterSpacing",
				"color",
				"background.enabled",
				"background.color",
				"opacity",
				"transform.scaleX",
				"transform.scaleY",
				"transform.rotate",
			];
		case "image":
		case "sticker":
		case "graphic":
			return [
				"opacity",
				"transform.scaleX",
				"transform.scaleY",
				"transform.rotate",
				"blendMode",
			];
		default:
			return [];
	}
}

export function AdjustmentView() {
	const selectedElement = useEditor((e) => {
		const selected = e.selection.getSelectedElements();
		const entries = e.timeline.getElementsWithTracks({ elements: selected });
		return entries.find(({ element }) => element.type !== "effect") ?? null;
	});

	if (!selectedElement) {
		return (
			<PanelView title="Adjustment">
				<div className="text-muted-foreground p-3 text-sm">
					Select a layer to adjust transform, opacity, text styling, and audio settings.
				</div>
			</PanelView>
		);
	}

	const availableParamKeys = new Set(
		getElementParams({ element: selectedElement.element }).map((param) => param.key),
	);
	const paramKeys = getSuggestedParamKeys({ element: selectedElement.element }).filter(
		(key) => availableParamKeys.has(key),
	);

	if (paramKeys.length === 0) {
		return (
			<PanelView title="Adjustment">
				<div className="text-muted-foreground p-3 text-sm">
					No adjustment controls are available for this selected layer.
				</div>
			</PanelView>
		);
	}

	return (
		<PanelView title="Adjustment" contentClassName="px-1">
			<ElementParamsTab
				element={selectedElement.element}
				trackId={selectedElement.track.id}
				paramKeys={paramKeys}
				sectionKey="assets-adjustment"
			/>
		</PanelView>
	);
}
