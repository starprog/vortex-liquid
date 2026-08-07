import { useCallback, useLayoutEffect, useState } from "react";
import { useResizeObserver } from "./use-resize-observer";

function getElementSize(element: HTMLElement | null) {
	if (!element) {
		return { width: 0, height: 0 };
	}

	const rect = element.getBoundingClientRect();
	const parentRect = element.parentElement?.getBoundingClientRect();
	const width = rect.width || element.clientWidth || parentRect?.width || 0;
	const height = rect.height || element.clientHeight || parentRect?.height || 0;

	return { width, height };
}

export function useContainerSize({
	containerRef,
}: {
	containerRef: React.RefObject<HTMLElement | null>;
}) {
	const [size, setSize] = useState({ width: 0, height: 0 });

	const onResize = useCallback((entry: ResizeObserverEntry) => {
		const target = entry.target;
		const targetElement = target instanceof HTMLElement ? target : null;
		const width =
			entry.contentRect.width ||
			targetElement?.clientWidth ||
			getElementSize(targetElement).width ||
			0;
		const height =
			entry.contentRect.height ||
			targetElement?.clientHeight ||
			getElementSize(targetElement).height ||
			0;
		setSize({ width, height });
	}, []);

	useLayoutEffect(() => {
		setSize(getElementSize(containerRef.current));
		const frame = window.requestAnimationFrame(() => {
			setSize(getElementSize(containerRef.current));
		});

		return () => {
			window.cancelAnimationFrame(frame);
		};
	}, [containerRef]);

	useResizeObserver({ ref: containerRef, onResize });

	return size;
}
