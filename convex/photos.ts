import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const savePhoto = mutation({
  args: {
    userId: v.id("users"),
    imageUri: v.string(),
    fileName: v.string(),
    fileSize: v.optional(v.number()),
    mimeType: v.optional(v.string()),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const photoId = await ctx.db.insert("photos", {
      userId: args.userId,
      imageUri: args.imageUri,
      fileName: args.fileName,
      fileSize: args.fileSize,
      mimeType: args.mimeType,
      caption: args.caption,
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

export const getAllPhotos = query({
  args: {},
  handler: async (ctx) => {
    const photos = await ctx.db
      .query("photos")
      .order("desc")
      .collect();

    // Fetch user data for each photo
    const photosWithUsers = await Promise.all(
      photos.map(async (photo) => {
        const user = await ctx.db.get(photo.userId);
        return {
          ...photo,
          userName: user?.name || 'Unknown User',
        };
      })
    );

    return photosWithUsers;
  },
});

