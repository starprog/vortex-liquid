import type { EffectDefinition, EffectPass } from "@/effects/types";
import {
	GAUSSIAN_BLUR_SHADER,
	buildGaussianBlurPasses,
	intensityToSigma,
} from "./blur";

function parseIntensity(effectParams: Record<string, unknown>, fallback = 20): number {
	const raw = effectParams.intensity;
	const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
	if (Number.isNaN(parsed)) {
		return fallback;
	}
	return Math.max(0, parsed);
}

function buildDirectionalBlurPasses({
	sigma,
	direction,
}: {
	sigma: number;
	direction: [number, number];
}): EffectPass[] {
	if (sigma < 0.001) {
		return [];
	}

	const passCount = Math.max(1, Math.min(8, Math.ceil((sigma * sigma) / (18 * 18))));
	const perPassSigma = sigma / Math.sqrt(passCount);
	const step = Math.max(1, perPassSigma / 10);

	return Array.from({ length: passCount }, () => ({
		shader: GAUSSIAN_BLUR_SHADER,
		uniforms: {
			u_sigma: perPassSigma,
			u_step: step,
			u_direction: direction,
		},
	}));
}

export const dreamyBlurEffectDefinition: EffectDefinition = {
	type: "dreamy-blur",
	name: "Dreamy Blur",
	keywords: ["soft", "dreamy", "glow"],
	params: [
		{
			key: "intensity",
			label: "Intensity",
			type: "number",
			default: 12,
			min: 0,
			max: 120,
			step: 1,
		},
	],
	renderer: {
		passes: [
			{
				shader: GAUSSIAN_BLUR_SHADER,
				uniforms: ({ effectParams, width }) => ({
					u_sigma: Math.max(
						intensityToSigma({
							intensity: parseIntensity(effectParams, 12),
							resolution: width,
							reference: 1920,
						}),
						0.001,
					),
					u_step: 1,
					u_direction: [1, 0],
				}),
			},
			{
				shader: GAUSSIAN_BLUR_SHADER,
				uniforms: ({ effectParams, height }) => ({
					u_sigma: Math.max(
						intensityToSigma({
							intensity: parseIntensity(effectParams, 12),
							resolution: height,
							reference: 1080,
						}),
						0.001,
					),
					u_step: 1,
					u_direction: [0, 1],
				}),
			},
		],
		buildPasses: ({ effectParams, width, height }) => {
			const intensity = parseIntensity(effectParams, 12);
			return buildGaussianBlurPasses({
				sigmaX: intensityToSigma({ intensity, resolution: width, reference: 1920 }),
				sigmaY: intensityToSigma({ intensity, resolution: height, reference: 1080 }),
			});
		},
	},
};

export const motionBlurHorizontalEffectDefinition: EffectDefinition = {
	type: "motion-blur-horizontal",
	name: "Motion Blur Horizontal",
	keywords: ["motion", "horizontal", "speed"],
	params: [
		{
			key: "intensity",
			label: "Intensity",
			type: "number",
			default: 16,
			min: 0,
			max: 150,
			step: 1,
		},
	],
	renderer: {
		passes: [
			{
				shader: GAUSSIAN_BLUR_SHADER,
				uniforms: ({ effectParams, width }) => ({
					u_sigma: Math.max(
						intensityToSigma({
							intensity: parseIntensity(effectParams, 16),
							resolution: width,
							reference: 1920,
						}),
						0.001,
					),
					u_step: 1,
					u_direction: [1, 0],
				}),
			},
		],
		buildPasses: ({ effectParams, width }) => {
			const intensity = parseIntensity(effectParams, 16);
			const sigma = intensityToSigma({
				intensity,
				resolution: width,
				reference: 1920,
			});
			return buildDirectionalBlurPasses({ sigma, direction: [1, 0] });
		},
	},
};

export const motionBlurVerticalEffectDefinition: EffectDefinition = {
	type: "motion-blur-vertical",
	name: "Motion Blur Vertical",
	keywords: ["motion", "vertical", "speed"],
	params: [
		{
			key: "intensity",
			label: "Intensity",
			type: "number",
			default: 16,
			min: 0,
			max: 150,
			step: 1,
		},
	],
	renderer: {
		passes: [
			{
				shader: GAUSSIAN_BLUR_SHADER,
				uniforms: ({ effectParams, height }) => ({
					u_sigma: Math.max(
						intensityToSigma({
							intensity: parseIntensity(effectParams, 16),
							resolution: height,
							reference: 1080,
						}),
						0.001,
					),
					u_step: 1,
					u_direction: [0, 1],
				}),
			},
		],
		buildPasses: ({ effectParams, height }) => {
			const intensity = parseIntensity(effectParams, 16);
			const sigma = intensityToSigma({
				intensity,
				resolution: height,
				reference: 1080,
			});
			return buildDirectionalBlurPasses({ sigma, direction: [0, 1] });
		},
	},
};
