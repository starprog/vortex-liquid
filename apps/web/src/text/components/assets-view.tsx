import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { useEditor } from "@/editor/use-editor";
import { DEFAULTS } from "@/timeline/defaults";
import { buildTextElement } from "@/timeline/element-utils";
import type { MediaTime } from "@/wasm";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";

const DEFAULT_TEXT_CONTENT = "Text";

export function TextView() {
	const editor = useEditor();
 	const activeScene = useEditor((currentEditor) =>
		currentEditor.scenes.getActiveSceneOrNull(),
	);

	const textItems = useMemo(() => {
		if (!activeScene) {
			return [] as Array<{ trackId: string; elementId: string; content: string; name: string }>;
		}

		const candidateTracks = [
			...activeScene.tracks.overlay,
			activeScene.tracks.main,
		];

		return candidateTracks
			.flatMap((track) =>
				track.elements.flatMap((element) => {
					if (element.type !== "text") {
						return [];
					}

					const rawContent = element.params.content;
					const content =
						typeof rawContent === "string" && rawContent.trim().length > 0
							? rawContent
							: "Text";

					return [
						{
							trackId: track.id,
							elementId: element.id,
							content,
							name: element.name,
							startTime: element.startTime,
						},
					];
				}),
			)
			.sort((a, b) => a.startTime - b.startTime)
			.map(({ trackId, elementId, content, name }) => ({
				trackId,
				elementId,
				content,
				name,
			}));
	}, [activeScene]);

	const handleAddToTimeline = ({
		currentTime,
	}: {
		currentTime: MediaTime;
	}) => {
		const baseParams = DEFAULTS.text.element.params ?? {};

		const element = buildTextElement({
			raw: {
				...DEFAULTS.text.element,
				name: "Text",
				params: {
					...baseParams,
					content: DEFAULT_TEXT_CONTENT,
					fontSize: 12,
				},
			},
			startTime: currentTime,
		});

		editor.timeline.insertElement({
			element,
			placement: { mode: "auto" },
		});
	};

	const handleSelectTextElement = ({
		trackId,
		elementId,
	}: {
		trackId: string;
		elementId: string;
	}) => {
		editor.selection.setSelectedElements({
			elements: [{ trackId, elementId }],
		});
	};

	return (
		<PanelView title="Text">
			<div className="flex h-full flex-col gap-4">
				<div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
					<DraggableItem
						name="Default text"
						preview={
							<div className="bg-accent flex size-full items-center justify-center rounded p-2">
								<span className="line-clamp-2 text-center text-xs select-none">{DEFAULT_TEXT_CONTENT}</span>
							</div>
						}
						dragData={{
							id: "temp-text-default",
							type: DEFAULTS.text.element.type,
							name: "Text",
							content: DEFAULT_TEXT_CONTENT,
						}}
						aspectRatio={1}
						onAddToTimeline={({ currentTime }) =>
							handleAddToTimeline({ currentTime })
						}
						shouldShowLabel={false}
					/>
				</div>

				<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
					<p className="text-muted-foreground text-xs">Text in this scene</p>
					<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
						{textItems.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No text clips yet. Add one to start editing.
							</p>
						) : (
							textItems.map((item) => (
								<Button
									key={item.elementId}
									variant="outline"
									className="w-full justify-start text-left"
									onClick={() =>
										handleSelectTextElement({
											trackId: item.trackId,
											elementId: item.elementId,
										})
									}
								>
									<span className="truncate">{item.content}</span>
								</Button>
							))
						)}
					</div>
				</div>
			</div>
		</PanelView>
	);
}
