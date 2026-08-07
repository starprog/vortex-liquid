import { useEffect } from "react";
import { useSoundsStore } from "@/sounds/sounds-store";

export function useSoundSearch({
	query,
	commercialOnly,
	apiBasePath,
}: {
	query: string;
	commercialOnly: boolean;
	apiBasePath: string;
}) {
	const {
		searchResults,
		isSearching,
		searchError,
		lastSearchQuery,
		currentPage,
		hasNextPage,
		isLoadingMore,
		totalCount,
		setSearchResults,
		setSearching,
		setSearchError,
		setLastSearchQuery,
		setCurrentPage,
		setHasNextPage,
		setTotalCount,
		setLoadingMore,
		appendSearchResults,
		appendTopSounds,
		resetPagination,
	} = useSoundsStore();

	const loadMore = async () => {
		if (isLoadingMore || !hasNextPage) return;

		try {
			setLoadingMore({ loading: true });
			const nextPage = currentPage + 1;
			const isSearchMode = query.trim().length > 0;

			const searchParams = new URLSearchParams({
				page: nextPage.toString(),
				type: "effects",
				page_size: isSearchMode ? "20" : "50",
				sort: "downloads",
			});

			if (isSearchMode) {
				searchParams.set("q", query);
			}

			searchParams.set("commercial_only", commercialOnly.toString());
			const response = await fetch(
				`${apiBasePath}/sounds/search?${searchParams.toString()}`,
			);

			if (response.ok) {
				const data = await response.json();

				if (query.trim()) {
					appendSearchResults({ results: data.results });
				} else {
					appendTopSounds({ results: data.results });
				}

				setCurrentPage({ page: nextPage });
				setHasNextPage({ hasNext: !!data.next });
				setTotalCount({ count: data.count });
			} else {
				setSearchError({ error: `Load more failed: ${response.status}` });
			}
		} catch (err) {
			setSearchError({
				error: err instanceof Error ? err.message : "Load more failed",
			});
		} finally {
			setLoadingMore({ loading: false });
		}
	};

	useEffect(() => {
		if (!query.trim()) {
			setSearchResults({ results: [] });
			setSearchError({ error: null });
			setLastSearchQuery({ query: "" });
			return;
		}

		if (query === lastSearchQuery && searchResults.length > 0) {
			return;
		}

		let ignore = false;

		const timeoutId = setTimeout(async () => {
			try {
				setSearching({ searching: true });
				setSearchError({ error: null });
				resetPagination();

				const response = await fetch(
					`${apiBasePath}/sounds/search?q=${encodeURIComponent(query)}&type=effects&page=1&page_size=20&sort=downloads&commercial_only=${commercialOnly}`,
				);

				if (!ignore) {
					if (response.ok) {
						const data = await response.json();
						setSearchResults({ results: data.results });
						setLastSearchQuery({ query: query });
						setHasNextPage({ hasNext: !!data.next });
						setTotalCount({ count: data.count });
						setCurrentPage({ page: 1 });
					} else {
						setSearchError({ error: `Search failed: ${response.status}` });
					}
				}
			} catch (err) {
				if (!ignore) {
					setSearchError({
						error: err instanceof Error ? err.message : "Search failed",
					});
				}
			} finally {
				if (!ignore) {
					setSearching({ searching: false });
				}
			}
		}, 300);

		return () => {
			clearTimeout(timeoutId);
			ignore = true;
		};
	}, [
		query,
		lastSearchQuery,
		apiBasePath,
		commercialOnly,
		searchResults.length,
		setSearchResults,
		setSearching,
		setSearchError,
		setLastSearchQuery,
		setCurrentPage,
		setHasNextPage,
		setTotalCount,
		resetPagination,
	]);

	return {
		results: searchResults,
		isLoading: isSearching,
		error: searchError,
		loadMore,
		hasNextPage,
		isLoadingMore,
		totalCount,
	};
}
