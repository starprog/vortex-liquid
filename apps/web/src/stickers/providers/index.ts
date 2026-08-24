import { stickersRegistry } from "../registry";
import type { StickerProvider } from "@/stickers/types";
import { emojisProvider } from "./emojis";
import { flagsProvider } from "./flags";
import { logosProvider } from "./logos";
import { shapesProvider } from "./shapes";

const defaultProviders: StickerProvider[] = [
	logosProvider,
	flagsProvider,
	shapesProvider,
	emojisProvider,
];

export function registerDefaultStickerProviders({
	providersToRegister = defaultProviders,
}: {
	providersToRegister?: StickerProvider[];
} = {}): void {
	for (const provider of providersToRegister) {
		if (stickersRegistry.has(provider.id)) {
			continue;
		}
		stickersRegistry.register(provider.id, provider);
	}
}
