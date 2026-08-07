import { describe, expect, test } from "bun:test";
import { shouldApplyVolumePreview } from "../audio-volume-preview";

describe("shouldApplyVolumePreview", () => {
	test("allows the first preview even when the value matches the initial state", () => {
		expect(
			shouldApplyVolumePreview({
				hasPreviewed: false,
				nextVolume: 0,
				lastPreviewVolume: 0,
			}),
		).toBe(true);
	});

	test("blocks duplicate previews when the value is unchanged", () => {
		expect(
			shouldApplyVolumePreview({
				hasPreviewed: true,
				nextVolume: 0,
				lastPreviewVolume: 0,
			}),
		).toBe(false);
	});

	test("allows previews after the initial value changes", () => {
		expect(
			shouldApplyVolumePreview({
				hasPreviewed: true,
				nextVolume: -6,
				lastPreviewVolume: 0,
			}),
		).toBe(true);
	});
});
