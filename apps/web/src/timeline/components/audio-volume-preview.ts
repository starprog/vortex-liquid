import { isNearlyEqual } from "@/utils/math";

export function shouldApplyVolumePreview({
	hasPreviewed,
	nextVolume,
	lastPreviewVolume,
}: {
	hasPreviewed: boolean;
	nextVolume: number;
	lastPreviewVolume: number;
}): boolean {
	if (!hasPreviewed) {
		return true;
	}

	return !isNearlyEqual({
		leftValue: nextVolume,
		rightValue: lastPreviewVolume,
	});
}
