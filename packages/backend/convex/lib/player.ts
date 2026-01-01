import type { Id } from "../_generated/dataModel";
import type { Building } from "./types";

export async function eliminatePlayer(
  ctx: any,
  gameId: Id<"games">,
  victimId: Id<"players">,
  conquerorId: Id<"players">
) {
  const victim = await ctx.db.get(victimId);
  const conqueror = await ctx.db.get(conquerorId);
  if (!(victim && conqueror)) {
    return;
  }

  // 1. Transfer Credits
  const loot = victim.credits;
  await ctx.db.patch(conquerorId, { credits: (conqueror.credits || 0) + loot });
  await ctx.db.patch(victimId, {
    credits: 0,
    status: "eliminated",
    eliminatedBy: conquerorId,
  });

  // 2. Transfer Buildings
  const mapDoc = await ctx.db
    .query("maps")
    .withIndex("by_gameId", (q: any) => q.eq("gameId", gameId))
    .first();

  if (mapDoc) {
    const newBuildings = mapDoc.buildings.map((b: Building) => {
      if (b.ownerId === victimId) {
        return {
          ...b,
          ownerId: conquerorId,
          captureStart: undefined,
          capturingOwnerId: undefined,
        };
      }
      return b;
    });
    await ctx.db.patch(mapDoc._id, { buildings: newBuildings });
  }

  // 3. Transfer Entities, Families, Troops
  const entities = await ctx.db
    .query("entities")
    .withIndex("by_gameId", (q: any) => q.eq("gameId", gameId))
    .collect();

  for (const e of entities) {
    if (e.ownerId === victimId) {
      await ctx.db.patch(e._id, { ownerId: conquerorId });
    }
  }

  const families = await ctx.db
    .query("families")
    .withIndex("by_gameId", (q: any) => q.eq("gameId", gameId))
    .collect();
  for (const f of families) {
    if (f.ownerId === victimId) {
      await ctx.db.patch(f._id, { ownerId: conquerorId });
    }
  }

  const troops = await ctx.db
    .query("troops")
    .withIndex("by_gameId", (q: any) => q.eq("gameId", gameId))
    .collect();
  for (const t of troops) {
    if (t.ownerId === victimId) {
      await ctx.db.patch(t._id, { ownerId: conquerorId });
    }
  }
}
