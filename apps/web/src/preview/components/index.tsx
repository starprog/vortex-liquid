"use client";

console.log("Preview module loaded");

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";
import { useEditor } from "@/editor/use-editor";
import { useRafLoop } from "@/hooks/use-raf-loop";
import { useContainerSize } from "@/hooks/use-container-size";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { DEFAULT_CANVAS_SIZE } from "@/canvas/sizes";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import { TICKS_PER_SECOND } from "@/wasm";
import type { RootNode } from "@/services/renderer/nodes/root-node";
import { buildScene } from "@/services/renderer/scene-builder";
import { PreviewOverlayLayer } from "./overlay-layer";
import { PreviewInteractionOverlay } from "./preview-interaction-overlay";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import type {
	PreviewOverlayControl,
	PreviewOverlayInstance,
} from "@/preview/overlays";
import { PreviewContextMenu } from "./context-menu";
import { PreviewToolbar } from "./toolbar";
import {
	PreviewViewportProvider,
	usePreviewViewportState,
} from "./preview-viewport";

function usePreviewSize() {
	const canvasSize = useEditor(
		(e) => e.project.getActive()?.settings.canvasSize,
	);

	return {
		width: canvasSize?.width && canvasSize.width > 0 ? canvasSize.width : DEFAULT_CANVAS_SIZE.width,
		height: canvasSize?.height && canvasSize.height > 0 ? canvasSize.height : DEFAULT_CANVAS_SIZE.height,
	};
}

function normalizeWheelDelta({
	delta,
	deltaMode,
	pageSize,
}: {
	delta: number;
	deltaMode: number;
	pageSize: number;
}): number {
	if (deltaMode === WheelEvent.DOM_DELTA_LINE) {
		return delta * 16;
	}

	if (deltaMode === WheelEvent.DOM_DELTA_PAGE) {
		return delta * pageSize;
	}

	return delta;
}

export function PreviewPanel({
	overlayControls,
	overlayInstances,
	onOverlayVisibilityChange,
}: {
	overlayControls: PreviewOverlayControl[];
	overlayInstances: PreviewOverlayInstance[];
	onOverlayVisibilityChange: (params: {
		overlayId: string;
		isVisible: boolean;
	}) => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const { toggleFullscreen } = useFullscreen({ containerRef });
	const handleContainerRef = useCallback((node: HTMLDivElement | null) => {
		containerRef.current = node;
		setContainer(node);
	}, []);

	return (
		<div
			ref={handleContainerRef}
			className="panel bg-background relative flex size-full min-h-0 min-w-0 flex-col rounded-sm border"
			style={{ minHeight: 320, minWidth: 320 }}
		>
			<PreviewCanvas
				container={container}
				onToggleFullscreen={toggleFullscreen}
				overlayControls={overlayControls}
				overlayInstances={overlayInstances}
				onOverlayVisibilityChange={onOverlayVisibilityChange}
			/>
			<RenderTreeController />
		</div>
	);
}

function RenderTreeController() {
	const editor = useEditor();
	const tracks = useEditor(
		(e) => e.timeline.getPreviewTracks() ?? e.scenes.getActiveScene().tracks,
	);
	const mediaAssets = useEditor((e) => e.media.getAssets());
	const activeProject = useEditor((e) => e.project.getActive());

	const { width, height } = usePreviewSize();

	useDeepCompareEffect(() => {
		if (!activeProject) return;

		const duration = editor.timeline.getTotalDuration();
		const renderTree = buildScene({
			tracks,
			mediaAssets,
			duration,
			canvasSize: { width, height },
			background: activeProject.settings.background,
			isPreview: true,
		});
		console.log("Render tree built", {
			trackCount: tracks?.length ?? 0,
			mediaAssetCount: mediaAssets?.length ?? 0,
			duration,
			canvasSize: { width, height },
			renderTreeChildren: renderTree?.children?.length ?? 0,
			renderTreePresent: !!renderTree,
		});
		(window as Window & { __previewDebug?: Record<string, unknown> }).__previewDebug = {
			...(window as Window & { __previewDebug?: Record<string, unknown> }).__previewDebug,
			renderTreePresent: !!renderTree,
			renderTreeChildren: renderTree?.children?.length ?? 0,
			duration,
			trackCount: tracks?.length ?? 0,
			mediaAssetCount: mediaAssets?.length ?? 0,
		};
		editor.renderer.setRenderTree({ renderTree });
	}, [tracks, mediaAssets, activeProject?.settings.background, width, height]);

	return null;
}

function PreviewCanvas({
	container,
	onToggleFullscreen,
	overlayControls,
	overlayInstances,
	onOverlayVisibilityChange,
}: {
	container: HTMLElement | null;
	onToggleFullscreen: () => void;
	overlayControls: PreviewOverlayControl[];
	overlayInstances: PreviewOverlayInstance[];
	onOverlayVisibilityChange: (params: {
		overlayId: string;
		isVisible: boolean;
	}) => void;
}) {
	const canvasMountRef = useRef<HTMLDivElement>(null);
	const viewportRef = useRef<HTMLDivElement>(null);
	const lastFrameRef = useRef(-1);
	const lastSceneRef = useRef<RootNode | null>(null);
	const renderingRef = useRef(false);
	const firstFrameRetryDeadlineRef = useRef(0);
	const { width: nativeWidth, height: nativeHeight } = usePreviewSize();
	const viewportSize = useContainerSize({ containerRef: viewportRef });
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActive());
	const renderTree = useEditor((e) => e.renderer.getRenderTree());
	const viewport = usePreviewViewportState({
		canvasHeight: nativeHeight,
		canvasWidth: nativeWidth,
		viewportHeight: viewportSize.height,
		viewportRef,
		viewportWidth: viewportSize.width,
	});
	const { canPan, panByScreenDelta, scaleZoom } = viewport;

	useEffect(() => {
		console.log("PreviewCanvas mounted", {
			nativeWidth,
			nativeHeight,
			viewportWidth: viewportSize.width,
			viewportHeight: viewportSize.height,
		});
		if (viewportRef.current) {
			viewportRef.current.setAttribute("data-preview-debug", "mounted");
		}
	}, [nativeHeight, nativeWidth, viewportSize.height, viewportSize.width]);

	const renderer = useMemo(() => {
		return new CanvasRenderer({
			width: nativeWidth,
			height: nativeHeight,
			fps: activeProject.settings.fps,
		});
	}, [nativeWidth, nativeHeight, activeProject.settings.fps]);

	// Mount the compositor's output canvas directly into the preview. wgpu
	// renders straight into this element, so there is no intermediate copy —
	// the container div owns positioning/styling, the canvas itself fills it.
	useEffect(() => {
		const mount = canvasMountRef.current;
		if (!mount) {
			console.warn("Preview mount is not ready");
			return;
		}
		mount.setAttribute("data-preview-debug", "mount-effect-started");
		try {
			console.log("Preview canvas mount effect", {
				mountPresent: !!mount,
				viewportWidth: viewportSize.width,
				viewportHeight: viewportSize.height,
				nativeWidth,
				nativeHeight,
				canvasSize: { width: nativeWidth, height: nativeHeight },
			});
			(window as Window & { __previewMountLog?: unknown }).__previewMountLog = {
				mountPresent: !!mount,
				viewportWidth: viewportSize.width,
				viewportHeight: viewportSize.height,
				nativeWidth,
				nativeHeight,
				canvasSize: { width: nativeWidth, height: nativeHeight },
			};
			const outputCanvas = renderer.getOutputCanvas();
			mount.setAttribute("data-preview-debug", `canvas:${outputCanvas?.constructor?.name}:${outputCanvas?.width}x${outputCanvas?.height}`);
			console.log("Preview canvas mount", {
				mountReady: true,
				canvasType: outputCanvas?.constructor?.name,
				canvasWidth: outputCanvas?.width,
				canvasHeight: outputCanvas?.height,
				parentTag: outputCanvas?.parentElement?.tagName,
			});
			(window as Window & { __previewMountLog?: unknown }).__previewMountLog = {
				mountReady: true,
				canvasType: outputCanvas?.constructor?.name,
				canvasWidth: outputCanvas?.width,
				canvasHeight: outputCanvas?.height,
				parentTag: outputCanvas?.parentElement?.tagName,
			};
			outputCanvas.style.display = "block";
			outputCanvas.style.width = "100%";
			outputCanvas.style.height = "100%";
			outputCanvas.style.background = "#111";
			const mountCtx = outputCanvas.getContext("2d");
			if (mountCtx) {
				mountCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
				mountCtx.fillStyle = "#22c55e";
				mountCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
			}
			mount.appendChild(outputCanvas);
			return () => {
				if (outputCanvas.parentElement === mount) {
					mount.removeChild(outputCanvas);
				}
			};
		} catch (error) {
			mount.setAttribute("data-preview-debug", `error:${error instanceof Error ? error.message : String(error)}`);
			console.error("Preview canvas mount failed", error);
		}
	}, [nativeHeight, nativeWidth, renderer, viewportSize.height, viewportSize.width]);

	const render = useCallback(() => {
		const debugState = {
			renderTreePresent: !!renderTree,
			renderTreeChildren: renderTree?.children?.length ?? 0,
		};
		(window as Window & { __previewDebug?: unknown }).__previewDebug = {
			...(window as Window & { __previewDebug?: Record<string, unknown> }).__previewDebug,
			...debugState,
			timestamp: Date.now(),
		};
		if (!renderTree) return;

		const tickState = {
			currentTime: editor.playback.getCurrentTime(),
			renderTime: Math.max(0, Math.min(editor.playback.getCurrentTime(), editor.timeline.getLastFrameTime())),
			viewportWidth: viewportSize.width,
			viewportHeight: viewportSize.height,
			nativeWidth,
			nativeHeight,
			renderTreeChildren: renderTree?.children?.length ?? 0,
			lastFrame: lastFrameRef.current,
			rendering: renderingRef.current,
		};
		console.log("Preview render tick", tickState);
		(window as Window & { __previewDebug?: unknown }).__previewDebug = {
			...tickState,
			timestamp: Date.now(),
		};

		const renderTime = Math.max(
			0,
			Math.min(
				editor.playback.getCurrentTime(),
				editor.timeline.getLastFrameTime(),
			),
		);
		const ticksPerFrame = Math.round(
			(TICKS_PER_SECOND * renderer.fps.denominator) / renderer.fps.numerator,
		);
		const frame = Math.floor(renderTime / ticksPerFrame);
		const allowStartFrameRetry =
			(frame === 0 || renderTime <= 0) &&
			performance.now() < firstFrameRetryDeadlineRef.current;

		const hasSameFrame =
			frame === lastFrameRef.current && renderTree === lastSceneRef.current;
		if (hasSameFrame && !allowStartFrameRetry) {
			return;
		}
		if (renderingRef.current) {
			return;
		}

		renderingRef.current = true;
		lastSceneRef.current = renderTree;
		lastFrameRef.current = frame;
		renderer
			.render({ node: renderTree, time: renderTime })
			.then(() => {
				renderingRef.current = false;
				(window as Window & { __previewDebug?: unknown }).__previewDebug = {
					...(window as Window & { __previewDebug?: Record<string, unknown> }).__previewDebug,
					lastRenderSucceeded: true,
					timestamp: Date.now(),
				};
			})
			.catch((error) => {
				renderingRef.current = false;
				lastFrameRef.current = -1;
				console.error("Preview render failed", error);
				(window as Window & { __previewDebug?: unknown }).__previewDebug = {
					...(window as Window & { __previewDebug?: Record<string, unknown> }).__previewDebug,
					lastRenderSucceeded: false,
					renderError: error instanceof Error ? error.message : String(error),
					timestamp: Date.now(),
				};
			});
	}, [editor.playback, editor.timeline, nativeHeight, nativeWidth, renderer, renderTree, viewportSize.height, viewportSize.width]);

	useEffect(() => {
		console.log("Preview render loop active");
	}, []);

	useEffect(() => {
		if (!renderTree) return;
		void renderer
			.render({
				node: renderTree,
				time: Math.max(0, editor.playback.getCurrentTime()),
			})
			.catch((error) => {
				console.error("Initial preview render failed", error);
			});
	}, [editor.playback, renderer, renderTree]);

	useRafLoop(render);

	useEffect(() => {
		lastFrameRef.current = -1;
		firstFrameRetryDeadlineRef.current = performance.now() + 1200;
	}, [renderTree]);

	useEffect(() => {
		const unsubscribeSeek = editor.playback.onSeek(() => {
			lastFrameRef.current = -1;
			firstFrameRetryDeadlineRef.current = performance.now() + 1200;
		});

		return unsubscribeSeek;
	}, [editor.playback]);

	useEffect(() => {
		const container = viewportRef.current;
		if (!container) return;

		let pendingZoomDelta = 0;
		let pendingPanDeltaX = 0;
		let pendingPanDeltaY = 0;
		let zoomRafId: ReturnType<typeof requestAnimationFrame> | null = null;
		let panRafId: ReturnType<typeof requestAnimationFrame> | null = null;

		const onWheel = (event: WheelEvent) => {
			const normalizedDeltaX = normalizeWheelDelta({
				delta: event.deltaX,
				deltaMode: event.deltaMode,
				pageSize: container.clientWidth,
			});
			const normalizedDeltaY = normalizeWheelDelta({
				delta: event.deltaY,
				deltaMode: event.deltaMode,
				pageSize: container.clientHeight,
			});
			const isZoomGesture = event.ctrlKey || event.metaKey;
			if (isZoomGesture) {
				event.preventDefault();
				pendingZoomDelta += normalizedDeltaY;

				if (zoomRafId === null) {
					zoomRafId = requestAnimationFrame(() => {
						const cappedDelta =
							Math.sign(pendingZoomDelta) *
							Math.min(Math.abs(pendingZoomDelta), 30);
						const zoomFactor = Math.exp(-cappedDelta / 300);

						scaleZoom({ factor: zoomFactor });
						pendingZoomDelta = 0;
						zoomRafId = null;
					});
				}

				return;
			}

			if (!canPan) {
				return;
			}

			if (normalizedDeltaX === 0 && normalizedDeltaY === 0) {
				return;
			}

			event.preventDefault();
			pendingPanDeltaX += normalizedDeltaX;
			pendingPanDeltaY += normalizedDeltaY;

			if (panRafId === null) {
				panRafId = requestAnimationFrame(() => {
					panByScreenDelta({
						deltaX: pendingPanDeltaX,
						deltaY: pendingPanDeltaY,
					});
					pendingPanDeltaX = 0;
					pendingPanDeltaY = 0;
					panRafId = null;
				});
			}
		};

		container.addEventListener("wheel", onWheel, {
			capture: true,
			passive: false,
		});

		return () => {
			container.removeEventListener("wheel", onWheel, {
				capture: true,
			});
			if (zoomRafId !== null) {
				cancelAnimationFrame(zoomRafId);
			}
			if (panRafId !== null) {
				cancelAnimationFrame(panRafId);
			}
		};
	}, [canPan, panByScreenDelta, scaleZoom]);

	return (
		<PreviewViewportProvider value={viewport}>
			<div className="flex size-full min-h-0 min-w-0 flex-col">
				<div className="flex min-h-0 min-w-0 flex-1 p-2 pb-0">
					<ContextMenu>
						<ContextMenuTrigger asChild>
							<div
								ref={viewportRef}
								className="relative flex size-full min-h-0 min-w-0 items-center justify-center overflow-hidden"
								style={{ minHeight: 240, minWidth: 240 }}
							>
							<div
								ref={canvasMountRef}
								data-preview-mount="true"
								className="absolute block border"
								style={{
									left: 0,
									top: 0,
									width: "100%",
									height: "100%",
									background:
										activeProject.settings.background.type === "blur"
											? "transparent"
											: activeProject?.settings.background.color,
								}}
							/>
								<PreviewOverlayLayer
									instances={overlayInstances}
									plane="under-interaction"
								/>
								<PreviewInteractionOverlay />
								<PreviewOverlayLayer
									instances={overlayInstances}
									plane="over-interaction"
								/>
							</div>
						</ContextMenuTrigger>
						<PreviewContextMenu
							onToggleFullscreen={onToggleFullscreen}
							container={container}
							overlayControls={overlayControls}
							onOverlayVisibilityChange={onOverlayVisibilityChange}
						/>
					</ContextMenu>
				</div>
				<PreviewToolbar onToggleFullscreen={onToggleFullscreen} />
			</div>
		</PreviewViewportProvider>
	);
}
