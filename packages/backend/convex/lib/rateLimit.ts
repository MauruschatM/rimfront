import { MutationCtx } from "../_generated/server";

export interface RateLimitConfig {
  max: number;
  windowMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  max: 10,
  windowMs: 60 * 1000, // 1 minute
};

/**
 * Checks if the given key has exceeded the rate limit.
 * If so, throws an error.
 * Otherwise, increments the counter.
 *
 * @param ctx Mutation context
 * @param key Unique identifier for the rate limit (e.g. userId)
 * @param config Optional configuration for max requests and window duration
 */
export async function checkRateLimit(
  ctx: MutationCtx,
  key: string,
  config: RateLimitConfig = DEFAULT_CONFIG
) {
  const now = Date.now();
  const limit = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  if (!limit) {
    await ctx.db.insert("rateLimits", {
      key,
      count: 1,
      windowStart: now,
    });
    return;
  }

  if (now - limit.windowStart > config.windowMs) {
    // Reset window
    await ctx.db.patch(limit._id, {
      count: 1,
      windowStart: now,
    });
  } else {
    if (limit.count >= config.max) {
      throw new Error("Rate limit exceeded. Please try again later.");
    }
    await ctx.db.patch(limit._id, {
      count: limit.count + 1,
    });
  }
}
