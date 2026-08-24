import { buildStickerId, parseStickerId } from "../sticker-id";
import { resolvePublicAssetUrl } from "./public-asset-url";
import type {
	StickerBrowseResult,
	StickerItem,
	StickerProvider,
	StickerSearchResult,
} from "../types";

const EMOJIS_PROVIDER_ID = "emojis";
const EMOJI_COUNT = 164;
const DEFAULT_SEARCH_LIMIT = 100;
const DEFAULT_EMOJIS_BASE_URL = "/emojis";

function getEmojisBaseUrl(): string {
	return resolvePublicAssetUrl({
		path: DEFAULT_EMOJIS_BASE_URL.replace(/\/$/, ""),
	}).replace(/\/$/, "");
}

function buildEmojiUrl({ index }: { index: number }): string {
	return `${getEmojisBaseUrl()}/${index}.svg`;
}

function getAllEmojiIndexes(): number[] {
	return Array.from({ length: EMOJI_COUNT }, (_, i) => i + 1);
}

function toStickerItem({ index }: { index: number }): StickerItem {
	return {
		id: buildStickerId({
			providerId: EMOJIS_PROVIDER_ID,
			providerValue: String(index),
		}),
		provider: EMOJIS_PROVIDER_ID,
		name: `Emoji ${index}`,
		previewUrl: buildEmojiUrl({ index }),
		metadata: {},
	};
}

function filterIndexesByQuery({ query }: { query: string }): number[] {
	const trimmed = query.trim();
	if (!trimmed) {
		return getAllEmojiIndexes();
	}

	const asNumber = Number(trimmed);
	if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= EMOJI_COUNT) {
		return [asNumber];
	}

	return "emoji".includes(trimmed.toLowerCase()) ? getAllEmojiIndexes() : [];
}

function paginateIndexes({
	indexes,
	options,
}: {
	indexes: number[];
	options?: { page?: number; limit?: number };
}): { items: number[]; hasMore: boolean; total: number } {
	if (options?.limit === undefined) {
		return { items: indexes, hasMore: false, total: indexes.length };
	}
	const page = Math.max(1, options.page ?? 1);
	const limit = Math.max(1, options.limit);
	const startIndex = (page - 1) * limit;
	const endIndex = startIndex + limit;
	return {
		items: indexes.slice(startIndex, endIndex),
		hasMore: endIndex < indexes.length,
		total: indexes.length,
	};
}

export const emojisProvider: StickerProvider = {
	id: EMOJIS_PROVIDER_ID,
	async search({
		query,
		options,
	}: {
		query: string;
		options?: { limit?: number };
	}): Promise<StickerSearchResult> {
		const filtered = filterIndexesByQuery({ query });
		const paged = paginateIndexes({
			indexes: filtered,
			options: { page: 1, limit: options?.limit ?? DEFAULT_SEARCH_LIMIT },
		});
		return {
			items: paged.items.map((index) => toStickerItem({ index })),
			total: paged.total,
			hasMore: paged.hasMore,
		};
	},
	async browse({
		options,
	}: {
		options?: { page?: number; limit?: number };
	}): Promise<StickerBrowseResult> {
		const paged = paginateIndexes({ indexes: getAllEmojiIndexes(), options });
		return {
			sections: [
				{
					id: "all",
					items: paged.items.map((index) => toStickerItem({ index })),
					hasMore: paged.hasMore,
					layout: "grid",
				},
			],
		};
	},
	resolveUrl({
		stickerId,
	}: {
		stickerId: string;
		options?: { width?: number; height?: number };
	}): string {
		const { providerValue } = parseStickerId({ stickerId });
		const index = Number(providerValue);
		return buildEmojiUrl({ index: Number.isInteger(index) ? index : 1 });
	},
};
