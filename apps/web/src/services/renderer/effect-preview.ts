import { createCanvasSurface } from "./canvas-utils";
import { effectsRegistry, resolveEffectPasses } from "@/effects";
import { buildDefaultParamValues } from "@/params/registry";
import type { ParamValues } from "@/params";
import { gpuRenderer } from "./gpu-renderer";
import { webEnv } from "@/env/web";

const PREVIEW_SIZE = 160;
// Hardcoded absolute path isn't rewritten by Next's basePath/assetPrefix, so prefix manually.
const PREVIEW_IMAGE_PATH = `${webEnv.NEXT_PUBLIC_BASE_PATH}/effects/preview.jpg`;

class EffectPreviewService {
	private testSourceCanvas: OffscreenCanvas | null = null;
	private previewImageElement: HTMLImageElement | null = null;
	private onReadyCallbacks = new Set<() => void>();

	readonly PREVIEW_SIZE = PREVIEW_SIZE;

	constructor() {
		this.loadPreviewImage();
	}

	onPreviewImageReady({ callback }: { callback: () => void }): () => void {
		this.onReadyCallbacks.add(callback);
		return () => this.onReadyCallbacks.delete(callback);
	}

	renderPreview({
		effectType,
		params,
		targetCanvas,
		uniformDimensions,
	}: {
		effectType: string;
		params: ParamValues;
		targetCanvas: HTMLCanvasElement;
		uniformDimensions?: { width: number; height: number };
	}): void {
		const size = PREVIEW_SIZE;
		const targetCtx = targetCanvas.getContext(
			"2d",
		) as CanvasRenderingContext2D | null;
		if (!targetCtx) {
			return;
		}

		targetCanvas.width = size;
		targetCanvas.height = size;

		try {
			const source = this.getTestSource({ width: size, height: size });
			if (!source) {
				this.drawFallbackToTarget({
					targetCtx,
					width: size,
					height: size,
				});
				return;
			}

			const definition = effectsRegistry.get(effectType);
			const resolvedParams =
				Object.keys(params).length > 0
					? params
					: buildDefaultParamValues(definition.params);

			const passes = resolveEffectPasses({
				definition,
				effectParams: resolvedParams,
				width: uniformDimensions?.width ?? size,
				height: uniformDimensions?.height ?? size,
			});
			const result = this.applyGpuEffect({
				source,
				width: size,
				height: size,
				passes,
			});

			targetCtx.drawImage(result, 0, 0, size, size);
		} catch (error) {
			console.warn("Failed to render effect preview", { effectType, error });
			this.drawFallbackToTarget({
				targetCtx,
				width: size,
				height: size,
			});
		}
	}

	private loadPreviewImage(): void {
		if (typeof window === "undefined") return;
		const image = new Image();
		image.onload = () => {
			this.testSourceCanvas = null;
			for (const callback of this.onReadyCallbacks) {
				callback();
			}
		};
		image.src = PREVIEW_IMAGE_PATH;
		this.previewImageElement = image;
	}

	private createTestSource({
		width,
		height,
	}: {
		width: number;
		height: number;
	}): OffscreenCanvas | null {
		if (typeof OffscreenCanvas === "undefined") {
			return null;
		}

		const { canvas, context } = createCanvasSurface({ width, height });
		const isImageReady =
			this.previewImageElement?.complete &&
			(this.previewImageElement.naturalWidth ?? 0) > 0;

		if (isImageReady && this.previewImageElement) {
			context.drawImage(this.previewImageElement, 0, 0, width, height);
			return canvas;
		}

		// Fallback preview source keeps effect thumbnails useful even if preview.jpg is missing.
		const gradient = context.createLinearGradient(0, 0, width, height);
		gradient.addColorStop(0, "#0f172a");
		gradient.addColorStop(0.5, "#0ea5e9");
		gradient.addColorStop(1, "#f97316");
		context.fillStyle = gradient;
		context.fillRect(0, 0, width, height);

		context.fillStyle = "rgba(255, 255, 255, 0.22)";
		context.beginPath();
		context.arc(width * 0.72, height * 0.3, width * 0.18, 0, Math.PI * 2);
		context.fill();

		context.fillStyle = "rgba(255, 255, 255, 0.32)";
		context.fillRect(width * 0.12, height * 0.62, width * 0.76, height * 0.2);

		return canvas;
	}

	private drawFallbackToTarget({
		targetCtx,
		width,
		height,
	}: {
		targetCtx: CanvasRenderingContext2D;
		width: number;
		height: number;
	}): void {
		targetCtx.clearRect(0, 0, width, height);
		const gradient = targetCtx.createLinearGradient(0, 0, width, height);
		gradient.addColorStop(0, "#1f2937");
		gradient.addColorStop(0.5, "#0ea5e9");
		gradient.addColorStop(1, "#f59e0b");
		targetCtx.fillStyle = gradient;
		targetCtx.fillRect(0, 0, width, height);

		targetCtx.fillStyle = "rgba(255, 255, 255, 0.28)";
		targetCtx.fillRect(width * 0.14, height * 0.62, width * 0.72, height * 0.18);
	}

	private getTestSource({
		width,
		height,
	}: {
		width: number;
		height: number;
	}): OffscreenCanvas | null {
		if (
			!this.testSourceCanvas ||
			this.testSourceCanvas.width !== width ||
			this.testSourceCanvas.height !== height
		) {
			this.testSourceCanvas = this.createTestSource({ width, height });
		}
		return this.testSourceCanvas;
	}

	private applyGpuEffect({
		source,
		width,
		height,
		passes,
	}: {
		source: OffscreenCanvas;
		width: number;
		height: number;
		passes: ReturnType<typeof resolveEffectPasses>;
	}): OffscreenCanvas {
		return gpuRenderer.applyEffect({
			source,
			width,
			height,
			passes,
		});
	}
}

export const effectPreviewService = new EffectPreviewService();
