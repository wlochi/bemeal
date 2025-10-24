import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const savePhoto = mutation({
  args: {
    userId: v.id("users"),
    imageUri: v.string(),
    fileName: v.string(),
    fileSize: v.optional(v.number()),
    mimeType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const photoId = await ctx.db.insert("photos", {
      userId: args.userId,
      imageUri: args.imageUri,
      fileName: args.fileName,
      fileSize: args.fileSize,
      mimeType: args.mimeType,
      createdAt: Date.now(),
    });
    return photoId;
  },
});

export const getUserPhotos = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("photos")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});

