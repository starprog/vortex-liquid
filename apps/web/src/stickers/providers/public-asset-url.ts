function normalizeAssetPath({ path }: { path: string }): string {
	if (!path) {
		return "/";
	}

	return path.startsWith("/") ? path : `/${path}`;
}

export function resolvePublicAssetUrl({ path }: { path: string }): string {
	const normalizedPath = normalizeAssetPath({ path });

	if (typeof window === "undefined") {
		return normalizedPath;
	}

	const nextData = (
		window as Window & { __NEXT_DATA__?: { assetPrefix?: string } }
	).__NEXT_DATA__;
	const assetPrefix = nextData?.assetPrefix?.trim() ?? "";

	if (assetPrefix && assetPrefix !== "/") {
		return `${assetPrefix.replace(/\/+$/, "")}${normalizedPath}`;
	}

	const currentPath = window.location.pathname;
	const projectsIndex = currentPath.indexOf("/projects");
	if (projectsIndex > 0) {
		const prefix = currentPath.slice(0, projectsIndex).replace(/\/+$/, "");
		if (prefix) {
			return `${prefix}${normalizedPath}`;
		}
	}

	return normalizedPath;
}
