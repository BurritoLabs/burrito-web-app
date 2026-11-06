// A quiet interval is a gap, not a swap. Share this pure builder with regression
// tests so the scheduled snapshot job cannot manufacture flat OHLC bars.
export const buildObservedCandles = ({ ticks, bucketMs, lookbackBuckets, now, maxCandles }) => {
  if (![bucketMs, lookbackBuckets, maxCandles].every((value) => Number.isSafeInteger(value) && value > 0) || !Number.isFinite(now)) return [];
  const lastBucket = Math.floor(now / bucketMs) * bucketMs;
  const firstBucket = lastBucket - bucketMs * (lookbackBuckets - 1);
  const sorted = ticks
    .filter((tick) => Number.isFinite(tick.timestamp) && tick.timestamp >= firstBucket && tick.timestamp <= now &&
      Number.isFinite(tick.price) && tick.price > 0 && Number.isFinite(tick.volumeQuote) && tick.volumeQuote >= 0)
    .sort((a, b) => a.timestamp - b.timestamp);
  const buckets = new Map();
  for (const tick of sorted) {
    const bucketStart = Math.floor(tick.timestamp / bucketMs) * bucketMs;
    const existing = buckets.get(bucketStart);
    if (!existing) {
      buckets.set(bucketStart, {
        bucketStart, open: tick.price, high: tick.price, low: tick.price, close: tick.price,
        volumeQuote: tick.volumeQuote, tradeCount: 1,
      });
    } else {
      existing.high = Math.max(existing.high, tick.price);
      existing.low = Math.min(existing.low, tick.price);
      existing.close = tick.price;
      existing.volumeQuote += tick.volumeQuote;
      existing.tradeCount += 1;
    }
  }
  return [...buckets.values()].sort((a, b) => a.bucketStart - b.bucketStart).slice(-maxCandles);
};
