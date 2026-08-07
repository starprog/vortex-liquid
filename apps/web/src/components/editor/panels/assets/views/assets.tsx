"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { MediaDragOverlay } from "@/components/editor/panels/assets/drag-overlay";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { mediaTimeFromSeconds, type MediaTime } from "@/wasm";
import { useEditor } from "@/editor/use-editor";
import { invokeAction } from "@/actions";
import {
	SelectableItem,
	SelectableSurface,
	useSelection,
	useSelectionScope,
} from "@/selection";
import { buildElementFromMedia } from "@/timeline/element-utils";
import {
	type MediaSortKey,
	type MediaSortOrder,
	type MediaViewMode,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";
import { MASKABLE_ELEMENT_TYPES } from "@/timeline";
import type { MediaAsset } from "@/media/types";
import { cn } from "@/utils/ui";
import { processMediaAssets } from "@/media/processing";
import { showMediaUploadToast } from "@/media/upload-toast";
import {
	CloudUploadIcon,
	GridViewIcon,
	LeftToRightListDashIcon,
	SortingOneNineIcon,
	Image02Icon,
	MusicNote03Icon,
	Video01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

interface RemoteLibraryAsset {
	id: string;
	name: string;
	type: "image" | "video" | "audio";
	url: string;
	path: string;
	mime: string;
	size: number;
	duration?: number;
	width?: number;
	height?: number;
	fps?: number;
	hasAudio?: boolean;
	thumbnailUrl?: string;
}

function resolveLibraryEndpoint(): string {
	if (typeof window === "undefined") {
		return "/portal/vortex-liquid/designer/media-library";
	}

	const params = new URLSearchParams(window.location.search);
	const mode = params.get("mode") === "admin" ? "admin" : "user";

	if (mode === "admin") {
		return "/admin/vortex-liquid/designer/media-library";
	}

	return "/portal/vortex-liquid/designer/media-library";
}

export function MediaView() {
	const editor = useEditor();
	const mediaFiles = useEditor((e) => e.media.getAssets());
	const activeProject = useEditor((e) => e.project.getActive());

	const {
		mediaViewMode,
		setMediaViewMode,
		highlightMediaId,
		clearHighlight,
		mediaSortBy,
		mediaSortOrder,
		setMediaSort,
	} = useAssetsPanelStore();

	const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
	const [libraryAssets, setLibraryAssets] = useState<RemoteLibraryAsset[]>([]);
	const [isLibraryPickerOpen, setIsLibraryPickerOpen] = useState(false);
	const uploadInputRef = useRef<HTMLInputElement>(null);
	const libraryEndpoint = useMemo(() => resolveLibraryEndpoint(), []);

	const refreshLibrary = async () => {
		setIsLoadingLibrary(true);
		try {
			const response = await fetch(libraryEndpoint, {
				headers: { Accept: "application/json" },
			});

			if (!response.ok) {
				throw new Error(`Library request failed (${response.status})`);
			}

			const payload = (await response.json()) as {
				items?: RemoteLibraryAsset[];
				images?: RemoteLibraryAsset[];
				videos?: RemoteLibraryAsset[];
				audio?: RemoteLibraryAsset[];
			};

			setLibraryAssets(payload.items ?? []);
		} catch (error) {
			console.error("Error loading media library:", error);
			toast.error("Could not load your media library");
		} finally {
			setIsLoadingLibrary(false);
		}
	};

	useEffect(() => {
		void refreshLibrary();
	}, [libraryEndpoint]);

	const openLibraryPicker = () => {
		setIsLibraryPickerOpen(true);
		void refreshLibrary();
	};

	const importLibraryAsset = async ({
		asset,
	}: {
		asset: RemoteLibraryAsset;
	}) => {
		if (!activeProject) {
			toast.error("No active project");
			return;
		}

		try {
			const response = await fetch(asset.url);
			if (!response.ok) {
				throw new Error(`Failed to fetch ${asset.name}`);
			}

			const blob = await response.blob();
			const file = new File([blob], asset.name, {
				type: asset.mime || blob.type || "application/octet-stream",
			});
			const [processedAsset] = await processMediaAssets({ files: [file] });

			if (!processedAsset) {
				throw new Error(`Could not import ${asset.name}`);
			}

			await editor.media.addMediaAsset({
				projectId: activeProject.metadata.id,
				asset: processedAsset,
			});

			toast.success(`Imported ${asset.name}`);
			setIsLibraryPickerOpen(false);
		} catch (error) {
			console.error("Error importing library asset:", error);
			toast.error(`Could not import ${asset.name}`);
		}
	};

	const importDeviceFiles = async ({ files }: { files: File[] }) => {
		if (!activeProject) {
			toast.error("No active project");
			return;
		}

		if (files.length === 0) {
			return;
		}

		const result = await showMediaUploadToast({
			filesCount: files.length,
			promise: async () => {
				const processedAssets = await processMediaAssets({ files });
				const uploadedNames: string[] = [];

				for (const asset of processedAssets) {
					if (!asset) continue;

					await editor.media.addMediaAsset({
						projectId: activeProject.metadata.id,
						asset,
					});

					uploadedNames.push(asset.name);
				}

				return {
					uploadedCount: uploadedNames.length,
					assetNames: uploadedNames,
				};
			},
		});

		if (result.uploadedCount > 0) {
			setIsLibraryPickerOpen(false);
		}
	};

	const openDevicePicker = () => {
		uploadInputRef.current?.click();
	};

	const handleDevicePickerChange = (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const files = Array.from(event.target.files ?? []);
		void importDeviceFiles({ files });
		event.target.value = "";
	};

	const handleRemove = ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => {
		event.stopPropagation();

		invokeAction("remove-media-assets", {
			projectId: activeProject.metadata.id,
			assetIds: ids,
		});
	};

	const handleSort = ({ key }: { key: MediaSortKey }) => {
		if (mediaSortBy === key) {
			setMediaSort({
				key,
				order: mediaSortOrder === "asc" ? "desc" : "asc",
			});
		} else {
			setMediaSort({ key, order: "asc" });
		}
	};

	const filteredMediaItems = useMemo(() => {
		const filtered = mediaFiles.filter((item) => !item.ephemeral);

		filtered.sort((a, b) => {
			let valueA: string | number;
			let valueB: string | number;

			switch (mediaSortBy) {
				case "name":
					valueA = a.name.toLowerCase();
					valueB = b.name.toLowerCase();
					break;
				case "type":
					valueA = a.type;
					valueB = b.type;
					break;
				case "duration":
					valueA = a.duration || 0;
					valueB = b.duration || 0;
					break;
				case "size":
					valueA = a.file.size;
					valueB = b.file.size;
					break;
				default:
					return 0;
			}

			if (valueA < valueB) return mediaSortOrder === "asc" ? -1 : 1;
			if (valueA > valueB) return mediaSortOrder === "asc" ? 1 : -1;
			return 0;
		});

		return filtered;
	}, [mediaFiles, mediaSortBy, mediaSortOrder]);

	const orderedMediaIds = useMemo(() => {
		return filteredMediaItems.map((item) => item.id);
	}, [filteredMediaItems]);

	const projectAssetCount = filteredMediaItems.length;
	const libraryAssetCount = libraryAssets.length;

	return (
		<>
			<PanelView
				title="Assets"
				actions={
					<MediaActions
						mediaViewMode={mediaViewMode}
						setMediaViewMode={setMediaViewMode}
						isProcessing={isLoadingLibrary}
						sortBy={mediaSortBy}
						sortOrder={mediaSortOrder}
						onSort={handleSort}
						onImport={openLibraryPicker}
					/>
				}
				className=""
				contentClassName="h-full"
			>
				{filteredMediaItems.length === 0 ? (
					<MediaDragOverlay
						isVisible={true}
						isProcessing={isLoadingLibrary}
						onClick={openLibraryPicker}
					/>
				) : (
					<SelectableSurface
						ariaLabel="Assets"
						orderedIds={orderedMediaIds}
						revealId={highlightMediaId}
						onRevealComplete={clearHighlight}
					>
						<MediaScopeRegistrar />
						<MediaItemList
							items={filteredMediaItems}
							mode={mediaViewMode}
							onRemove={handleRemove}
						/>
					</SelectableSurface>
				)}
			</PanelView>
			<input
				ref={uploadInputRef}
				type="file"
				accept="image/*,video/*,audio/*"
				multiple
				className="hidden"
				onChange={handleDevicePickerChange}
			/>
			<Dialog open={isLibraryPickerOpen} onOpenChange={setIsLibraryPickerOpen}>
				<DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden p-0">
					<DialogHeader>
						<DialogTitle>Import assets</DialogTitle>
						<DialogDescription>
							Choose files from your Vortex library or upload directly from your device.
						</DialogDescription>
					</DialogHeader>
					<DialogBody className="max-h-[70vh] overflow-auto">
						<div className="mb-4 flex items-center justify-between gap-3">
							<div className="flex items-center gap-2">
								<span className="bg-muted text-muted-foreground rounded-md px-2 py-1 text-xs">
									Project: {projectAssetCount}
								</span>
								<span className="bg-muted text-muted-foreground rounded-md px-2 py-1 text-xs">
									Library: {libraryAssetCount}
								</span>
							</div>
							<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={openDevicePicker}
								className="items-center justify-center gap-1.5"
							>
								<HugeiconsIcon icon={CloudUploadIcon} />
								Upload from device
							</Button>
							<Button
								type="button"
								variant="ghost"
								onClick={() => void refreshLibrary()}
								disabled={isLoadingLibrary}
							>
								Refresh
							</Button>
							</div>
						</div>
						<LibraryAssetSection
							assets={libraryAssets}
							isLoading={isLoadingLibrary}
							onImport={importLibraryAsset}
						/>
					</DialogBody>
				</DialogContent>
			</Dialog>
		</>
	);
}

function MediaScopeRegistrar() {
	useSelectionScope();
	return null;
}

function MediaAssetDraggable({
	item,
	preview,
	variant,
	isRounded,
}: {
	item: MediaAsset;
	preview: React.ReactNode;
	variant: "card" | "compact";
	isRounded?: boolean;
}) {
	const editor = useEditor();

	const addElementAtTime = ({
		asset,
		startTime,
	}: {
		asset: MediaAsset;
		startTime: MediaTime;
	}) => {
		const duration =
			asset.duration != null
				? mediaTimeFromSeconds({ seconds: asset.duration })
				: DEFAULT_NEW_ELEMENT_DURATION;
		const element = buildElementFromMedia({
			mediaId: asset.id,
			mediaType: asset.type,
			name: asset.name,
			duration,
			startTime,
		});
		editor.timeline.insertElement({
			element,
			placement: { mode: "auto" },
		});
	};

	return (
		<DraggableItem
			name={item.name}
			preview={preview}
			dragData={{
				id: item.id,
				type: "media",
				mediaType: item.type,
				name: item.name,
				...(item.type !== "audio" && {
					targetElementTypes: [...MASKABLE_ELEMENT_TYPES],
				}),
			}}
			shouldShowPlusOnDrag={false}
			onAddToTimeline={({ currentTime }) =>
				addElementAtTime({ asset: item, startTime: currentTime })
			}
			variant={variant}
			isRounded={isRounded}
		/>
	);
}

function MediaItemWithContextMenu({
	item,
	children,
	onRemove,
}: {
	item: MediaAsset;
	children: React.ReactNode;
	onRemove: ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => void;
}) {
	const { isSelected, selectedIds } = useSelection();
	const idsToDelete = isSelected(item.id) ? selectedIds : [item.id];
	const deleteLabel =
		idsToDelete.length > 1 ? `Delete ${idsToDelete.length} items` : "Delete";

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem>Export clips</ContextMenuItem>
				<ContextMenuItem
					variant="destructive"
					onClick={(event: React.MouseEvent<HTMLDivElement>) =>
						onRemove({ event, ids: idsToDelete })
					}
				>
					{deleteLabel}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

function MediaItemList({
	items,
	mode,
	onRemove,
}: {
	items: MediaAsset[];
	mode: MediaViewMode;
	onRemove: ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => void;
}) {
	const isGrid = mode === "grid";

	return (
		<div
			className={cn(isGrid ? "grid gap-4" : "flex flex-col gap-1.5")}
			style={
				isGrid ? { gridTemplateColumns: "repeat(auto-fill, 7rem)" } : undefined
			}
		>
			{items.map((item) => (
				<MediaItemWithContextMenu item={item} onRemove={onRemove} key={item.id}>
					<SelectableItem className={cn(!isGrid && "w-full")} id={item.id}>
						<MediaAssetDraggable
							item={item}
							preview={
								<MediaPreview
									item={item}
									variant={isGrid ? "grid" : "compact"}
								/>
							}
							variant={isGrid ? "card" : "compact"}
							isRounded={isGrid ? false : undefined}
						/>
					</SelectableItem>
				</MediaItemWithContextMenu>
			))}
		</div>
	);
}

function formatDuration({ duration }: { duration: number }) {
	const min = Math.floor(duration / 60);
	const sec = Math.floor(duration % 60);
	return `${min}:${sec.toString().padStart(2, "0")}`;
}

function MediaDurationBadge({ duration }: { duration?: number }) {
	if (!duration) return null;

	return (
		<div className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-xs text-white">
			{formatDuration({ duration })}
		</div>
	);
}

function MediaDurationLabel({ duration }: { duration?: number }) {
	if (!duration) return null;

	return (
		<span className="text-xs opacity-70">{formatDuration({ duration })}</span>
	);
}

function MediaTypePlaceholder({
	icon,
	label,
	duration,
	variant,
}: {
	icon: IconSvgElement;
	label: string;
	duration?: number;
	variant: "muted" | "bordered";
}) {
	const iconClassName = cn("size-6", variant === "bordered" && "mb-1");

	return (
		<div
			className={cn(
				"text-muted-foreground flex size-full flex-col items-center justify-center rounded",
				variant === "muted" ? "bg-muted/30" : "border",
			)}
		>
			<HugeiconsIcon icon={icon} className={iconClassName} />
			<span className="text-xs">{label}</span>
			<MediaDurationLabel duration={duration} />
		</div>
	);
}

function MediaPreview({
	item,
	variant = "grid",
}: {
	item: MediaAsset;
	variant?: "grid" | "compact";
}) {
	const shouldShowDurationBadge = variant === "grid";

	if (item.type === "image") {
		return (
			<div className="relative flex size-full items-center justify-center bg-muted">
				<Image
					src={item.url ?? ""}
					alt={item.name}
					fill
					sizes="100vw"
					className="object-cover"
					loading="lazy"
					unoptimized
				/>
			</div>
		);
	}

	if (item.type === "video") {
		if (item.thumbnailUrl) {
			return (
				<div className="relative size-full">
					<Image
						src={item.thumbnailUrl}
						alt={item.name}
						fill
						sizes="100vw"
						className="rounded object-cover"
						loading="lazy"
						unoptimized
					/>
					{shouldShowDurationBadge ? (
						<MediaDurationBadge duration={item.duration} />
					) : null}
				</div>
			);
		}

		return (
			<MediaTypePlaceholder
				icon={Video01Icon}
				label="Video"
				duration={item.duration}
				variant="muted"
			/>
		);
	}

	if (item.type === "audio") {
		return (
			<MediaTypePlaceholder
				icon={MusicNote03Icon}
				label="Audio"
				duration={item.duration}
				variant="bordered"
			/>
		);
	}

	return (
		<MediaTypePlaceholder icon={Image02Icon} label="Unknown" variant="muted" />
	);
}

function MediaActions({
	mediaViewMode,
	setMediaViewMode,
	isProcessing,
	sortBy,
	sortOrder,
	onSort,
	onImport,
}: {
	mediaViewMode: MediaViewMode;
	setMediaViewMode: (mode: MediaViewMode) => void;
	isProcessing: boolean;
	sortBy: MediaSortKey;
	sortOrder: MediaSortOrder;
	onSort: ({ key }: { key: MediaSortKey }) => void;
	onImport: () => void;
}) {
	return (
		<div className="flex gap-1.5">
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							size="icon"
							variant="ghost"
							onClick={() =>
								setMediaViewMode(mediaViewMode === "grid" ? "list" : "grid")
							}
							disabled={isProcessing}
							className="items-center justify-center"
						>
							{mediaViewMode === "grid" ? (
								<HugeiconsIcon icon={LeftToRightListDashIcon} />
							) : (
								<HugeiconsIcon icon={GridViewIcon} />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>
							{mediaViewMode === "grid"
								? "Switch to list view"
								: "Switch to grid view"}
						</p>
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<DropdownMenu>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<Button
									size="icon"
									variant="ghost"
									disabled={isProcessing}
									className="items-center justify-center"
								>
									<HugeiconsIcon icon={SortingOneNineIcon} />
								</Button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<DropdownMenuContent align="end">
							<SortMenuItem
								label="Name"
								sortKey="name"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label="Type"
								sortKey="type"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label="Duration"
								sortKey="duration"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label="File size"
								sortKey="size"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
						</DropdownMenuContent>
					</DropdownMenu>
					<TooltipContent>
						<p>
							Sort by {sortBy} (
							{sortOrder === "asc" ? "ascending" : "descending"})
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
			<Button
				variant="outline"
				onClick={onImport}
				disabled={isProcessing}
				size="sm"
				className="items-center justify-center gap-1.5"
			>
				<HugeiconsIcon icon={CloudUploadIcon} />
				Add media
			</Button>
		</div>
	);
}

function LibraryAssetSection({
	assets,
	isLoading,
	onImport,
}: {
	assets: RemoteLibraryAsset[];
	isLoading: boolean;
	onImport: ({ asset }: { asset: RemoteLibraryAsset }) => Promise<void>;
}) {
	return (
		<div className="space-y-3 overflow-auto pb-2">
			<div className="flex items-center justify-between gap-3">
				<div>
					<p className="text-sm font-medium">Your media library</p>
					<p className="text-muted-foreground text-xs">
						Files saved to your Vortex account and available to import into this project.
					</p>
				</div>
				{isLoading ? <p className="text-xs opacity-70">Loading...</p> : null}
			</div>
			{assets.length === 0 ? (
				<div className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
					No saved media found in your library yet.
				</div>
			) : (
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					{assets.map((asset) => (
						<LibraryAssetCard
							key={asset.id}
							asset={asset}
							onImport={onImport}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function LibraryAssetCard({
	asset,
	onImport,
}: {
	asset: RemoteLibraryAsset;
	onImport: ({ asset }: { asset: RemoteLibraryAsset }) => Promise<void>;
}) {
	const preview =
		asset.type === "image" ? (
			<div className="relative flex size-full items-center justify-center bg-muted">
				<Image
					src={asset.url}
					alt={asset.name}
					fill
					sizes="100vw"
					className="object-cover"
					loading="lazy"
					unoptimized
				/>
			</div>
		) : asset.type === "video" && asset.thumbnailUrl ? (
			<div className="relative size-full">
				<Image
					src={asset.thumbnailUrl}
					alt={asset.name}
					fill
					sizes="100vw"
					className="object-cover"
					loading="lazy"
					unoptimized
				/>
				<MediaDurationBadge duration={asset.duration} />
			</div>
		) : asset.type === "audio" ? (
			<MediaTypePlaceholder
				icon={MusicNote03Icon}
				label="Audio"
				duration={asset.duration}
				variant="bordered"
			/>
		) : (
			<MediaTypePlaceholder icon={Image02Icon} label="Asset" variant="muted" />
		);

	return (
		<div className="border-border/70 overflow-hidden rounded-lg border">
			<div className="aspect-video w-full">{preview}</div>
			<div className="space-y-3 p-3">
				<div className="space-y-1">
					<p className="truncate text-sm font-medium" title={asset.name}>
						{asset.name}
					</p>
					<p className="text-muted-foreground text-xs uppercase tracking-wide">
						{asset.type} · {Math.round(asset.size / 1024)} KB
					</p>
				</div>
				<Button
					type="button"
					variant="secondary"
					size="sm"
					className="w-full"
					onClick={() => void onImport({ asset })}
				>
					Import to project
				</Button>
			</div>
		</div>
	);
}

function SortMenuItem({
	label,
	sortKey,
	currentSortBy,
	currentSortOrder,
	onSort,
}: {
	label: string;
	sortKey: MediaSortKey;
	currentSortBy: MediaSortKey;
	currentSortOrder: MediaSortOrder;
	onSort: ({ key }: { key: MediaSortKey }) => void;
}) {
	const isActive = currentSortBy === sortKey;
	const arrow = isActive ? (currentSortOrder === "asc" ? "↑" : "↓") : "";

	return (
		<DropdownMenuItem onSelect={() => onSort({ key: sortKey })}>
			{label} {arrow}
		</DropdownMenuItem>
	);
}
