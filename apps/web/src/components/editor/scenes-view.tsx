"use client";

import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Check, ListCheck, Trash2 } from "lucide-react";
import { cn } from "@/utils/ui";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogTrigger,
} from "@/components/ui/dialog";
import { canDeleteScene, getMainScene } from "@/timeline/scenes";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { Pencil, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";

export function ScenesView({ children }: { children: React.ReactNode }) {
	const editor = useEditor();
	const scenes = editor.scenes.getScenes();
	const currentScene = editor.scenes.getActiveScene();
	const [isSelectMode, setIsSelectMode] = useState(false);
	const [selectedScenes, setSelectedScenes] = useState<Set<string>>(new Set());
	const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
	const [editingName, setEditingName] = useState("");

	const handleSceneSwitch = async (sceneId: string) => {
		if (isSelectMode) {
			toggleSceneSelection({ sceneId });
			return;
		}

		try {
			await editor.scenes.switchToScene({ sceneId });
		} catch (error) {
			console.error("Failed to switch scene:", error);
		}
	};

	const toggleSceneSelection = ({ sceneId }: { sceneId: string }) => {
		setSelectedScenes((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(sceneId)) {
				newSet.delete(sceneId);
			} else {
				newSet.add(sceneId);
			}
			return newSet;
		});
	};

	const handleSelectMode = () => {
		setIsSelectMode(!isSelectMode);
		setSelectedScenes(new Set());
		setEditingSceneId(null);
		setEditingName("");
	};

	const handleDeleteSelected = async () => {
		for (const sceneId of selectedScenes) {
			const scene = scenes.find((scene) => scene.id === sceneId);
			if (!scene) {
				continue;
			}

			const { canDelete, reason } = canDeleteScene({ scene });
			if (!canDelete) {
				toast.error(reason || "Failed to delete scene");
				continue;
			}

			try {
				await editor.scenes.deleteScene({ sceneId });
			} catch (error) {
				console.error("Failed to delete scene:", error);
			}
		}
		setSelectedScenes(new Set());
		setIsSelectMode(false);
	};

	const handleAddScene = async () => {
		const existingCount = scenes.filter((scene) => !scene.isMain).length;
		const sceneName = `Scene ${existingCount + 1}`;

		try {
			const sceneId = await editor.scenes.createScene({
				name: sceneName,
				isMain: false,
			});
			await editor.scenes.switchToScene({ sceneId });
			toast.success(`Created ${sceneName}`);
		} catch (error) {
			console.error("Failed to create scene:", error);
			toast.error("Failed to create scene");
		}
	};

	const handleStartRename = ({ sceneId, name }: { sceneId: string; name: string }) => {
		setEditingSceneId(sceneId);
		setEditingName(name);
	};

	const handleCancelRename = () => {
		setEditingSceneId(null);
		setEditingName("");
	};

	const handleSaveRename = async ({ sceneId }: { sceneId: string }) => {
		const nextName = editingName.trim();
		if (!nextName) {
			toast.error("Scene name cannot be empty");
			return;
		}

		const existingScene = scenes.find((scene) => scene.id === sceneId);
		if (!existingScene) {
			handleCancelRename();
			return;
		}

		if (existingScene.name === nextName) {
			handleCancelRename();
			return;
		}

		try {
			await editor.scenes.renameScene({ sceneId, name: nextName });
			toast.success("Scene renamed");
			handleCancelRename();
		} catch (error) {
			console.error("Failed to rename scene:", error);
			toast.error("Failed to rename scene");
		}
	};

	const isMainSceneSelected = (() => {
		const mainScene = getMainScene({ scenes });
		return Boolean(mainScene?.id && selectedScenes.has(mainScene.id));
	})();

	return (
		<Sheet>
			<SheetTrigger asChild>{children}</SheetTrigger>
			<SheetContent>
				<SheetHeader>
					<SheetTitle>
						{isSelectMode ? `Select scenes (${selectedScenes.size})` : "Scenes"}
					</SheetTitle>
					<SheetDescription>
						{isSelectMode
							? "Select scenes to delete"
							: "Switch between scenes in your project"}
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-4 py-4">
					<div className="flex items-center gap-2">
						<Button className="rounded-md" variant="default" size="sm" onClick={handleAddScene}>
							<Plus />
							Add Scene
						</Button>
						<Button
							className="rounded-md"
							variant={isSelectMode ? "default" : "outline"}
							size="sm"
							onClick={handleSelectMode}
						>
							<ListCheck />
							{isSelectMode ? "Cancel" : "Select"}
						</Button>
						{isSelectMode && (
							<DeleteDialog
								count={selectedScenes.size}
								onDelete={handleDeleteSelected}
								disabled={isMainSceneSelected}
								trigger={
									<Button
										className="rounded-md"
										variant="destructive"
										disabled={isMainSceneSelected}
										size="sm"
									>
										<Trash2 />
										Delete ({selectedScenes.size})
									</Button>
								}
							/>
						)}
					</div>
					{scenes.length === 0 ? (
						<div className="text-muted-foreground text-sm">
							No scenes available
						</div>
					) : (
						<div className="space-y-2">
							{scenes.map((scene) => (
								<div
									key={scene.id}
									role="button"
									tabIndex={0}
									className={cn(
										"border-input bg-background ring-offset-background hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm font-normal focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
										currentScene?.id === scene.id &&
											!isSelectMode &&
											"border-primary !text-primary",
										isSelectMode &&
											selectedScenes.has(scene.id) &&
											"bg-accent border-foreground/30",
									)}
									onClick={() => handleSceneSwitch(scene.id)}
									onDoubleClick={() => {
										if (!isSelectMode) {
											handleStartRename({ sceneId: scene.id, name: scene.name });
										}
									}}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											void handleSceneSwitch(scene.id);
										}
									}}
								>
									{editingSceneId === scene.id ? (
										<div className="flex w-full items-center gap-2">
											<Input
												autoFocus
												value={editingName}
												onClick={(event) => event.stopPropagation()}
												onChange={(event) => setEditingName(event.target.value)}
												onKeyDown={(event) => {
													event.stopPropagation();
													if (event.key === "Enter") {
														event.preventDefault();
														void handleSaveRename({ sceneId: scene.id });
													}
													if (event.key === "Escape") {
														event.preventDefault();
														handleCancelRename();
													}
												}}
											/>
											<Button
												size="sm"
												variant="secondary"
												onClick={(event) => {
													event.stopPropagation();
													void handleSaveRename({ sceneId: scene.id });
												}}
											>
												Save
											</Button>
										</div>
									) : (
										<span>{scene.name}</span>
									)}
									<div className="flex items-center gap-2">
										{!isSelectMode && editingSceneId !== scene.id && (
											<Button
												size="icon"
												variant="ghost"
												className="size-7"
												onClick={(event) => {
													event.stopPropagation();
													handleStartRename({ sceneId: scene.id, name: scene.name });
												}}
											>
												<Pencil className="size-4" />
											</Button>
										)}
										{((isSelectMode && selectedScenes.has(scene.id)) ||
											(!isSelectMode && currentScene?.id === scene.id)) && (
											<Check className="size-4" />
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}

function DeleteDialog({
	count,
	onDelete,
	disabled,
	trigger,
}: {
	count: number;
	onDelete: () => void;
	disabled?: boolean;
	trigger: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);

	const handleDelete = () => {
		onDelete();
		setOpen(false);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete Scenes</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete {count} scene
						{count === 1 ? "" : "s"}? This action cannot be undone.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleDelete}
						disabled={disabled}
					>
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
