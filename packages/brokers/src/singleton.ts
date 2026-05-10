import { IbkrAdapter, type IbkrConfig, type Logger } from "./ibkr.js";

let _adapter: IbkrAdapter | null = null;

/**
 * Process-wide singleton. Returns the same IbkrAdapter instance for the
 * lifetime of the process; callers manage `connect()` / `isConnected()`
 * explicitly. The first caller's config is what the instance uses; later
 * calls receive the same instance regardless of any new config passed.
 */
export function getBrokerAdapter(
  config: IbkrConfig,
  logger: Logger | null = null
): IbkrAdapter {
  if (_adapter) return _adapter;
  _adapter = new IbkrAdapter(config, logger);
  return _adapter;
}

/** Test helper: disconnect (best-effort, fire-and-forget) and clear the singleton. */
export function resetBrokerAdapter(): void {
  const adapter = _adapter;
  _adapter = null;
  if (adapter) {
    adapter.disconnect().catch(() => {
      /* swallow */
    });
  }
}
