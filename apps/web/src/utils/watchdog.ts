const DEFAULT_POLL_MS = 100;

export class WatchdogTimeoutError extends Error {
	constructor(message = "Operation timed out") {
		super(message);
		this.name = "WatchdogTimeoutError";
	}
}

export class WatchdogCancelledError extends Error {
	constructor(message = "Operation was cancelled") {
		super(message);
		this.name = "WatchdogCancelledError";
	}
}

/**
 * Races a promise against cancellation/timeout polling.
 *
 * Some decode APIs (WebCodecs-based video/audio decoding via mediabunny, in
 * particular) offer no AbortSignal and can stall forever on a problematic
 * media file without ever resolving or rejecting. This helper can't abort
 * the underlying operation, but it lets the caller stop *waiting* on it so a
 * single stalled frame/asset can't hang an entire export (and so a
 * user-triggered cancel can't be ignored while the app appears frozen).
 */
export function raceWithWatchdog<T>({
	promise,
	isCancelled,
	timeoutMs,
	pollMs = DEFAULT_POLL_MS,
}: {
	promise: Promise<T>;
	isCancelled?: () => boolean;
	timeoutMs: number;
	pollMs?: number;
}): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		let settled = false;
		const startedAt = Date.now();

		const poll = setInterval(() => {
			if (settled) return;

			if (isCancelled?.()) {
				settled = true;
				clearInterval(poll);
				reject(new WatchdogCancelledError());
				return;
			}

			if (Date.now() - startedAt >= timeoutMs) {
				settled = true;
				clearInterval(poll);
				reject(new WatchdogTimeoutError());
			}
		}, pollMs);

		promise.then(
			(value) => {
				if (settled) return;
				settled = true;
				clearInterval(poll);
				resolve(value);
			},
			(error) => {
				if (settled) return;
				settled = true;
				clearInterval(poll);
				reject(error);
			},
		);
	});
}
