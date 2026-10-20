"use client";

import { useState } from "react";
import type { ParamDefinition, ParamValue, ParamValues } from "@/params";
import type { Effect } from "@/effects/types";
import type { EffectElement, TimelineElement, VisualElement } from "@/timeline";
import { effectsRegistry } from "@/effects";
import { buildEffectParamPath, resolveAnimationPathValueAtTime } from "@/animation";
import type { ElementAnimations } from "@/animation/types";
import type { MediaTime } from "@/wasm";
import { useEditor } from "@/editor/use-editor";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import { useKeyframedParamProperty } from "@/components/editor/panels/properties/hooks/use-keyframed-param-property";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
	SectionFields,
} from "@/components/section";
import { PropertyParamField } from "@/components/editor/panels/properties/components/property-param-field";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Delete02Icon,
	ViewIcon,
	ViewOffSlashIcon,
	MagicWand05Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";
import { Separator } from "@/components/ui/separator";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";

export function StandaloneEffectTab({
	element,
	trackId,
}: {
	element: EffectElement;
	trackId: string;
}) {
	const { renderElement } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});

	const effect: Effect = {
		id: element.id,
		type: element.effectType,
		params: element.params,
		enabled: true,
	};

	const buildBaseUpdates = ({
		key,
		value,
	}: {
		key: string;
		value: ParamValue;
	}): Partial<TimelineElement> => ({
		params: { ...(renderElement as EffectElement).params, [key]: value },
	});

	return (
		<div className="flex flex-col h-full">
			<div className="border-b px-3.5 h-11 shrink-0 flex items-center">
				<SectionTitle>Effect</SectionTitle>
			</div>
			<EffectSection
				effect={effect}
				trackId={trackId}
				elementId={element.id}
				animations={element.animations}
				localTime={localTime}
				isPlayheadWithinElementRange={isPlayheadWithinElementRange}
				renderParams={(renderElement as EffectElement).params}
				buildBaseUpdates={buildBaseUpdates}
			/>
		</div>
	);
}

export function ClipEffectsTab({
	element,
	trackId,
}: {
	element: VisualElement;
	trackId: string;
}) {
	const [dragIndex, setDragIndex] = useState<number | null>(null);
	const [dropIndex, setDropIndex] = useState<number | null>(null);
	const editor = useEditor();
	const { renderElement } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});

	const effects: Effect[] = element.effects ?? [];

	const getRenderParams = ({ effectId }: { effectId: string }): ParamValues => {
		return (
			(renderElement as VisualElement).effects?.find((ef) => ef.id === effectId)
				?.params ??
			effects.find((ef) => ef.id === effectId)?.params ??
			{}
		);
	};

	const buildBaseUpdates =
		(effectId: string) =>
		({ key, value }: { key: string; value: ParamValue }): Partial<TimelineElement> => ({
			effects: ((renderElement as VisualElement).effects ?? []).map((existing) =>
				existing.id !== effectId
					? existing
					: { ...existing, params: { ...existing.params, [key]: value } },
			),
		});

	const handleDragStart = ({ index }: { index: number }) => setDragIndex(index);

	const handleDragOver = ({
		event,
		index,
	}: {
		event: React.DragEvent;
		index: number;
	}) => {
		event.preventDefault();
		if (index !== dropIndex) setDropIndex(index);
	};

	const handleDrop = ({ toIndex }: { toIndex: number }) => {
		if (dragIndex !== null && dragIndex !== toIndex) {
			editor.timeline.reorderClipEffects({
				trackId,
				elementId: element.id,
				fromIndex: dragIndex,
				toIndex,
			});
		}
		setDragIndex(null);
		setDropIndex(null);
	};

	const handleDragEnd = () => {
		setDragIndex(null);
		setDropIndex(null);
	};

	return (
		<div className="flex flex-col h-full">
			<div className="border-b px-3.5 h-11 shrink-0 flex items-center">
				<SectionTitle>Effects</SectionTitle>
			</div>
			{effects.length === 0 ? (
				<EmptyView />
			) : (
				<ul className="flex flex-col">
					{effects.map((effect, index) => {
						const resolvedDragIndex = dragIndex ?? -1;
						const isDragging = dragIndex === index;
						const isDropTarget =
							dropIndex === index && dragIndex !== null && dragIndex !== index;
						const showTopDropIndicator =
							isDropTarget && index < resolvedDragIndex;
						const showBottomDropIndicator =
							isDropTarget && index > resolvedDragIndex;

						return (
							<li
								key={effect.id}
								draggable
								onDragStart={() => handleDragStart({ index })}
								onDragOver={(event) => handleDragOver({ event, index })}
								onDrop={() => handleDrop({ toIndex: index })}
								onDragEnd={handleDragEnd}
								className={cn(
									"group list-none",
									isDragging && "opacity-40",
									showTopDropIndicator && "border-t-2 border-primary",
									showBottomDropIndicator && "border-b-2 border-primary",
								)}
							>
								<EffectSection
									effect={effect}
									trackId={trackId}
									elementId={element.id}
									animations={element.animations}
									localTime={localTime}
									isPlayheadWithinElementRange={isPlayheadWithinElementRange}
									renderParams={getRenderParams({ effectId: effect.id })}
									buildBaseUpdates={buildBaseUpdates(effect.id)}
									onToggle={() =>
										editor.timeline.toggleClipEffect({
											trackId,
											elementId: element.id,
											effectId: effect.id,
										})
									}
									onRemove={() =>
										editor.timeline.removeClipEffect({
											trackId,
											elementId: element.id,
											effectId: effect.id,
										})
									}
								/>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

function EmptyView() {
	const setActiveTab = useAssetsPanelStore((s) => s.setActiveTab);

	return (
		<div className="flex flex-col h-full items-center justify-center gap-4 text-center">
			<HugeiconsIcon
				icon={MagicWand05Icon}
				className="size-10 text-muted-foreground"
				strokeWidth={1}
			/>
			<div className="flex flex-col gap-2">
				<h3 className="font-medium text-foreground">No effects</h3>
				<p className="text-muted-foreground text-sm text-balance max-w-44">
					Add effects to this layer from the Assets panel.
				</p>
			</div>
			<Button
				variant="default"
				size="sm"
				onClick={() => setActiveTab("effects")}
			>
				Open effects
			</Button>
		</div>
	);
}

function EffectSection({
	effect,
	trackId,
	elementId,
	animations,
	localTime,
	isPlayheadWithinElementRange,
	renderParams,
	buildBaseUpdates,
	onToggle,
	onRemove,
}: {
	effect: Effect;
	trackId: string;
	elementId: string;
	animations: ElementAnimations | undefined;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
	renderParams: ParamValues;
	buildBaseUpdates: (params: {
		key: string;
		value: ParamValue;
	}) => Partial<TimelineElement>;
	onToggle?: () => void;
	onRemove?: () => void;
}) {
	const definition = effectsRegistry.get(effect.type);

	return (
		<Section
			sectionKey={onToggle ? `clip-effect:${effect.id}` : undefined}
			showTopBorder={false}
		>
			<SectionHeader
				className={cn(onToggle && "cursor-move")}
				trailing={
					onToggle && (
						<div className="flex items-center gap-1">
							<Button
								variant={effect.enabled ? "secondary" : "ghost"}
								size="icon"
								aria-label={`Toggle ${definition.name}`}
								onClick={onToggle}
							>
								<HugeiconsIcon
									icon={effect.enabled ? ViewIcon : ViewOffSlashIcon}
								/>
							</Button>
							<Button
								variant="ghost"
								size="icon"
								aria-label={`Remove ${definition.name}`}
								onClick={onRemove}
							>
								<HugeiconsIcon icon={Delete02Icon} />
							</Button>
						</div>
					)
				}
			>
				<SectionTitle
					className={cn(onToggle && !effect.enabled && "text-muted-foreground")}
				>
					{definition.name}
				</SectionTitle>
			</SectionHeader>
			<SectionContent
				className={cn("p-0", onToggle && !effect.enabled && "opacity-50")}
			>
				<SectionFields>
					{definition.params.map((param) => (
						<EffectParamField
							key={param.key}
							param={param}
							renderValue={renderParams[param.key] ?? param.default}
							effectId={effect.id}
							trackId={trackId}
							elementId={elementId}
							animations={animations}
							localTime={localTime}
							isPlayheadWithinElementRange={isPlayheadWithinElementRange}
							buildBaseUpdates={buildBaseUpdates}
						/>
					))}
				</SectionFields>
			</SectionContent>
		</Section>
	);
}

function EffectParamField({
	param,
	renderValue,
	effectId,
	trackId,
	elementId,
	animations,
	localTime,
	isPlayheadWithinElementRange,
	buildBaseUpdates,
}: {
	param: ParamDefinition;
	renderValue: ParamValue;
	effectId: string;
	trackId: string;
	elementId: string;
	animations: ElementAnimations | undefined;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
	buildBaseUpdates: (params: {
		key: string;
		value: ParamValue;
	}) => Partial<TimelineElement>;
}) {
	const propertyPath = buildEffectParamPath({ effectId, paramKey: param.key });
	const resolvedValue = resolveAnimationPathValueAtTime({
		animations,
		propertyPath,
		localTime,
		fallbackValue: renderValue,
	});
	const animatedParam = useKeyframedParamProperty({
		param,
		trackId,
		elementId,
		animations,
		propertyPath,
		localTime,
		isPlayheadWithinElementRange,
		resolvedValue,
		buildBaseUpdates: ({ value }) => buildBaseUpdates({ key: param.key, value }),
	});

	return (
		<div className="flex flex-col gap-3.5">
			<div className="px-4">
				<PropertyParamField
					param={param}
					value={resolvedValue}
					onPreview={animatedParam.onPreview}
					onCommit={animatedParam.onCommit}
					keyframe={
						param.keyframable === false
							? undefined
							: {
									isActive: animatedParam.isKeyframedAtTime,
									isDisabled: !isPlayheadWithinElementRange,
									onToggle: animatedParam.toggleKeyframe,
								}
					}
				/>
			</div>
			<Separator />
		</div>
	);
}
