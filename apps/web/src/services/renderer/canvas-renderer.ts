import type { FrameRate } from "opencut-wasm";
import type { AnyBaseNode } from "./nodes/base-node";
import { createCanvasSurface } from "./canvas-utils";
import { buildFrameDescriptor } from "./compositor/frame-descriptor";
import type { FrameDescriptor, TextureUploadDescriptor } from "./compositor/types";
import { wasmCompositor } from "./compositor/wasm-compositor";
import { resolveRenderTree } from "./resolve";
import {
	measureSpanAsync,
	measureSpanSync,
	onRenderPerfFrameComplete,
} from "@/diagnostics/render-perf";

export type CanvasRendererParams = {
	width: number;
	height: number;
	fps: FrameRate;
};

export class CanvasRenderer {
	canvas: OffscreenCanvas;
	context: OffscreenCanvasRenderingContext2D;
	outputCanvas: HTMLCanvasElement;
	outputContext: CanvasRenderingContext2D | null;
	width: number;
	height: number;
	fps: FrameRate;

	constructor({ width, height, fps }: CanvasRendererParams) {
		this.width = width;
		this.height = height;
		this.fps = fps;

		const surface = createCanvasSurface({ width, height });
		this.canvas = surface.canvas;
		this.context = surface.context;
		this.outputCanvas = document.createElement("canvas");
		this.outputCanvas.width = width;
		this.outputCanvas.height = height;
		this.outputContext = this.outputCanvas.getContext("2d");
	}

	getOutputCanvas(): HTMLCanvasElement {
		if (this.outputCanvas.width !== this.width || this.outputCanvas.height !== this.height) {
			this.outputCanvas.width = this.width;
			this.outputCanvas.height = this.height;
			this.outputContext = this.outputCanvas.getContext("2d");
		}
		return this.outputCanvas;
	}

	setSize({ width, height }: { width: number; height: number }) {
		this.width = width;
		this.height = height;

		const surface = createCanvasSurface({ width, height });
		this.canvas = surface.canvas;
		this.context = surface.context;
		this.outputCanvas.width = width;
		this.outputCanvas.height = height;
		this.outputContext = this.outputCanvas.getContext("2d");
	}

	async render({ node, time }: { node: AnyBaseNode; time: number }) {
		try {
			await measureSpanAsync({
				name: "resolve",
				fn: () => resolveRenderTree({ node, renderer: this, time }),
			});
			const { frame, textures } = await measureSpanAsync({
				name: "buildFrame",
				fn: () => buildFrameDescriptor({ node, renderer: this }),
			});
			(window as Window & { __previewDebug?: Record<string, unknown> }).__previewDebug = {
				...(window as Window & { __previewDebug?: Record<string, unknown> }).__previewDebug,
				frameItems: frame.items.length,
				frameTextures: textures.length,
				frameWidth: frame.width,
				frameHeight: frame.height,
			};
			(window as Window & { __previewDebug?: Record<string, unknown> }).__previewDebug = {
				...(window as Window & { __previewDebug?: Record<string, unknown> }).__previewDebug,
				frameItems: frame.items.length,
				frameTextures: textures.length,
				frameWidth: frame.width,
				frameHeight: frame.height,
				lastRenderSucceeded: true,
				timestamp: Date.now(),
			};
			measureSpanSync({
				name: "renderFrame",
				fn: () => this.renderFrameToOutputCanvas({ frame, textures }),
			});
		} catch (error) {
			console.error("Preview renderer failed", error);
			(window as Window & { __previewDebug?: Record<string, unknown> }).__previewDebug = {
				...(window as Window & { __previewDebug?: Record<string, unknown> }).__previewDebug,
				lastRenderSucceeded: false,
				renderError: error instanceof Error ? error.message : String(error),
				timestamp: Date.now(),
			};
			throw error;
		}
	}

	private renderFrameToOutputCanvas({
		frame,
		textures,
	}: {
		frame: FrameDescriptor;
		textures: TextureUploadDescriptor[];
	}) {
		const ctx = this.outputCanvas.getContext("2d");
		if (!ctx) {
			throw new Error("Failed to get output canvas context");
		}

		this.outputCanvas.width = frame.width;
		this.outputCanvas.height = frame.height;
		this.outputContext = this.outputCanvas.getContext("2d");
		if (!this.outputContext) {
			throw new Error("Failed to initialize output canvas context");
		}

		const outputCtx = this.outputContext;
		outputCtx.setTransform(1, 0, 0, 1, 0, 0);
		outputCtx.clearRect(0, 0, frame.width, frame.height);
		const [red, green, blue, alpha] = frame.clear.color;
		outputCtx.fillStyle = `rgba(${Math.round(red * 255)}, ${Math.round(green * 255)}, ${Math.round(blue * 255)}, ${alpha})`;
		outputCtx.fillRect(0, 0, frame.width, frame.height);

		if (frame.items.length === 0) {
			outputCtx.fillStyle = "rgba(255,255,255,0.16)";
			outputCtx.fillRect(16, 16, Math.max(32, frame.width - 32), Math.max(32, frame.height - 32));
		}

		const textureMap = new Map(textures.map((texture) => [texture.id, texture]));
		for (const item of frame.items) {
			if (item.type !== "layer") {
				continue;
			}

			const texture = textureMap.get(item.textureId);
			if (!texture) {
				continue;
			}

			outputCtx.save();
			outputCtx.globalAlpha = item.opacity;
			outputCtx.translate(item.transform.centerX, item.transform.centerY);
			outputCtx.rotate((item.transform.rotationDegrees * Math.PI) / 180);
			outputCtx.scale(item.transform.flipX ? -1 : 1, item.transform.flipY ? -1 : 1);
			outputCtx.translate(-item.transform.centerX, -item.transform.centerY);

			const drawWidth = Math.max(1, item.transform.width);
			const drawHeight = Math.max(1, item.transform.height);
			const drawX = item.transform.centerX - drawWidth / 2;
			const drawY = item.transform.centerY - drawHeight / 2;

			if (texture.kind === "rendered") {
				const tempCanvas = document.createElement("canvas");
				tempCanvas.width = Math.max(1, texture.width);
				tempCanvas.height = Math.max(1, texture.height);
				const tempCtx = tempCanvas.getContext("2d");
				if (tempCtx) {
					tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
					texture.draw(tempCtx);
					outputCtx.drawImage(tempCanvas, drawX, drawY, drawWidth, drawHeight);
				}
			} else {
				outputCtx.drawImage(texture.source, drawX, drawY, drawWidth, drawHeight);
			}

			outputCtx.restore();
		}
	}

	async renderToCanvas({
		node,
		time,
		targetCanvas,
	}: {
		node: AnyBaseNode;
		time: number;
		targetCanvas: HTMLCanvasElement;
	}) {
		await this.render({ node, time });

		const ctx = targetCanvas.getContext("2d");
		if (!ctx) {
			throw new Error("Failed to get target canvas context");
		}

		measureSpanSync({
			name: "drawImage",
			fn: () =>
				ctx.drawImage(
					this.getOutputCanvas(),
					0,
					0,
					targetCanvas.width,
					targetCanvas.height,
				),
		});
		onRenderPerfFrameComplete();
	}
}
