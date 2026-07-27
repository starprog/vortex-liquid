import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";
import {
	dreamyBlurEffectDefinition,
	motionBlurHorizontalEffectDefinition,
	motionBlurVerticalEffectDefinition,
} from "./blur-variants";

const defaultEffects = [
	blurEffectDefinition,
	dreamyBlurEffectDefinition,
	motionBlurHorizontalEffectDefinition,
	motionBlurVerticalEffectDefinition,
];

export function registerDefaultEffects(): void {
	for (const definition of defaultEffects) {
		if (effectsRegistry.has(definition.type)) {
			continue;
		}
		effectsRegistry.register({
			key: definition.type,
			definition,
		});
	}
}
