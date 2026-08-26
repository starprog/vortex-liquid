function normalizeAssetPath({ path }: { path: string }): string {
	if (!path) {
		return "/";
	}

	return path.startsWith("/") ? path : `/${path}`;
}

export function resolvePublicAssetUrl({ path }: { path: string }): string {
	const normalizedPath = normalizeAssetPath({ path });

	// basePath/assetPrefix only rewrite Next's own asset handling; hardcoded
	// absolute paths like these need the build-time-inlined basePath manually.
	// (window.__NEXT_DATA__ isn't populated under the App Router, and a
	// path-based heuristic breaks on any route without "/projects" in it,
	// e.g. "/liquid/editor/{id}" - so read NEXT_PUBLIC_BASE_PATH directly.)
	const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(
		/\/+$/,
		"",
	);

	if (basePath) {
		return `${basePath}${normalizedPath}`;
	}

	return normalizedPath;
}
