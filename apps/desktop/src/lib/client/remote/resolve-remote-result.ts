type Runnable<T> = { run: () => T | Promise<T> };
const hasRun = <T>(value: unknown): value is Runnable<T> => Boolean(value && (typeof value === 'object' || typeof value === 'function') && 'run' in value && typeof (value as Runnable<T>).run === 'function');
const isAwaitable = (value: { then?: unknown }) => {
  try { return typeof value.then === 'function'; } catch { return false; }
};

export const resolveRemoteResult = async <T>(value: T | Promise<T> | Runnable<T>): Promise<T> => {
  if (hasRun<T>(value) && !isAwaitable(value as { then?: unknown })) return value.run();
  return value as T | Promise<T>;
};
