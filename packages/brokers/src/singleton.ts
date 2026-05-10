import { IbkrAdapter, type IbkrConfig, type Logger } from "./ibkr.js";

let _adapter: IbkrAdapter | null = null;
let _connectPromise: Promise<IbkrAdapter> | null = null;

/**
 * Process-wide singleton. The first caller wins config; subsequent calls
 * receive the same instance regardless of the config they pass. Connect
 * is performed lazily and reused across concurrent first callers.
 */
export function getBrokerAdapter(
  config: IbkrConfig,
  logger: Logger | null = null
): Promise<IbkrAdapter> {
  if (_adapter && _adapter.isConnected()) {
    return Promise.resolve(_adapter);
  }
  if (_connectPromise) return _connectPromise;
  if (!_adapter) _adapter = new IbkrAdapter(config, logger);
  const adapter = _adapter;
  _connectPromise = adapter
    .connect()
    .then(() => adapter)
    .catch((err) => {
      _connectPromise = null;
      throw err;
    });
  return _connectPromise;
}

/** Test helper: disconnect and clear the singleton. */
export async function resetBrokerAdapter(): Promise<void> {
  const adapter = _adapter;
  _adapter = null;
  _connectPromise = null;
  if (adapter) {
    try {
      await adapter.disconnect();
    } catch {
      /* swallow */
    }
  }
}
