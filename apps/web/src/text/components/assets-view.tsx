import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { useEditor } from "@/editor/use-editor";
import { DEFAULTS } from "@/timeline/defaults";
import { buildTextElement } from "@/timeline/element-utils";
import type { MediaTime } from "@/wasm";

interface TextPreset {
	id: string;
	name: string;
	content: string;
	params?: Record<string, unknown>;
}

const TEXT_PRESETS: TextPreset[] = [
	{
		id: "default",
		name: "Default text",
		content: "Default text",
	},
	{
		id: "headline-bold",
		name: "Bold Headline",
		content: "YOUR BIG IDEA",
		params: {
			fontSize: 56,
			fontWeight: "bold",
			lineHeight: 1.05,
			letterSpacing: 1.2,
			color: "#FFFFFF",
			"background.enabled": true,
			"background.color": "#111827",
			"background.cornerRadius": 14,
			"background.paddingX": 22,
			"background.paddingY": 10,
			"background.offsetX": 0,
			"background.offsetY": 0,
		},
	},
	{
		id: "caption-highlight",
		name: "Caption Highlight",
		content: "This moment matters.",
		params: {
			fontSize: 36,
			fontWeight: "bold",
			color: "#111827",
			textAlign: "center",
			"background.enabled": true,
			"background.color": "#FDE047",
			"background.cornerRadius": 8,
			"background.paddingX": 14,
			"background.paddingY": 8,
			"background.offsetX": 0,
			"background.offsetY": 0,
		},
	},
	{
		id: "neon-title",
		name: "Neon Title",
		content: "NEON VIBES",
		params: {
			fontSize: 52,
			fontWeight: "bold",
			letterSpacing: 2,
			lineHeight: 1.05,
			color: "#67E8F9",
			"background.enabled": true,
			"background.color": "#0F172A",
			"background.cornerRadius": 12,
			"background.paddingX": 18,
			"background.paddingY": 10,
			"background.offsetX": 0,
			"background.offsetY": 0,
		},
	},
];

export function TextView() {
	const editor = useEditor();

	const handleAddToTimeline = ({
		currentTime,
		preset,
	}: {
		currentTime: MediaTime;
		preset: TextPreset;
	}) => {
		const activeScene = editor.scenes.getActiveScene();
		if (!activeScene) return;

		const baseParams = DEFAULTS.text.element.params ?? {};
		const presetParams = preset.params ?? {};

		const element = buildTextElement({
			raw: {
				...DEFAULTS.text.element,
				name: preset.name,
				params: {
					...baseParams,
					...presetParams,
					content: preset.content,
				},
			},
			startTime: currentTime,
		});

		editor.timeline.insertElement({
			element,
			placement: { mode: "auto" },
		});
	};

	return (
		<PanelView title="Text">
			<div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
				{TEXT_PRESETS.map((preset) => (
					<DraggableItem
						key={preset.id}
						name={preset.name}
						preview={
							<div className="bg-accent flex size-full items-center justify-center rounded p-2">
								<span className="line-clamp-2 text-center text-xs select-none">{preset.content}</span>
							</div>
						}
						dragData={{
							id: `temp-text-${preset.id}`,
							type: DEFAULTS.text.element.type,
							name: preset.name,
							content: preset.content,
						}}
						aspectRatio={1}
						onAddToTimeline={({ currentTime }) =>
							handleAddToTimeline({ currentTime, preset })
						}
						shouldShowLabel={false}
					/>
				))}
			</div>
		</PanelView>
	);
}
