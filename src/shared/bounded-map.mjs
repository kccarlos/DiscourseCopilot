/**
 * Map values with a fixed worker pool. Results retain input order even when
 * individual tasks finish out of order.
 */
export async function mapWithConcurrency(values, concurrency, mapper) {
  const items = Array.from(values || []);
  if (!items.length) {
    return [];
  }
  if (typeof mapper !== 'function') {
    throw new TypeError('A mapper function is required');
  }

  const workerCount = Math.min(items.length, Math.max(1, Math.floor(Number(concurrency) || 1)));
  const results = new Array(items.length);
  let nextIndex = 0;
  let stopped = false;

  async function worker() {
    while (!stopped) {
      const index = nextIndex++;
      if (index >= items.length) {
        return;
      }
      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        stopped = true;
        throw error;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
