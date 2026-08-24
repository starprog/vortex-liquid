import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/utils/ui";
import { dimensionToAspectRatio } from "@/utils/geometry";
import { DEFAULT_CANVAS_PRESETS, DEFAULT_CANVAS_SIZE } from "@/canvas/sizes";
import type { TCanvasSize } from "@/project/types";

const PRESET_LABELS: Record<string, string> = {
	"16:9": "16:9 Landscape",
	"9:16": "9:16 Portrait / Reels",
	"1:1": "1:1 Square",
	"4:3": "4:3 Classic",
};

function areCanvasSizesEqual({
	left,
	right,
}: {
	left: TCanvasSize;
	right: TCanvasSize;
}) {
	return left.width === right.width && left.height === right.height;
}

export function RenameProjectDialog({
	isOpen,
	onOpenChange,
	onConfirm,
	projectName,
	title = "Rename project",
	confirmLabel = "Rename",
	showCanvasSizeOptions = false,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (newName: string, canvasSize?: TCanvasSize) => void;
	projectName: string;
	title?: string;
	confirmLabel?: string;
	showCanvasSizeOptions?: boolean;
}) {
	const [name, setName] = useState(projectName);
	const [canvasSize, setCanvasSize] = useState<TCanvasSize>(
		DEFAULT_CANVAS_SIZE,
	);

	const handleOpenChange = (open: boolean) => {
		if (open) {
			setName(projectName);
			setCanvasSize(DEFAULT_CANVAS_SIZE);
		}
		onOpenChange(open);
	};

	const handleConfirm = () => {
		onConfirm(name, showCanvasSizeOptions ? canvasSize : undefined);
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>

				<DialogBody className="gap-3">
					<Label>New name</Label>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								handleConfirm();
							}
						}}
						placeholder="Enter a new name"
					/>

					{showCanvasSizeOptions && (
						<div className="flex flex-col gap-2">
							<Label>Aspect ratio</Label>
							<div className="grid grid-cols-2 gap-2">
								{DEFAULT_CANVAS_PRESETS.map((preset) => {
									const ratio = dimensionToAspectRatio(preset);
									const isSelected = areCanvasSizesEqual({
										left: preset,
										right: canvasSize,
									});
									return (
										<Button
											key={ratio}
											type="button"
											variant={isSelected ? "secondary" : "outline"}
											className={cn(
												"justify-start",
												!isSelected && "opacity-75",
											)}
											onClick={() => setCanvasSize(preset)}
										>
											{PRESET_LABELS[ratio] ?? ratio}
										</Button>
									);
								})}
							</div>
						</div>
					)}
				</DialogBody>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							onOpenChange(false);
						}}
					>
						Cancel
					</Button>
					<Button onClick={handleConfirm}>{confirmLabel}</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
