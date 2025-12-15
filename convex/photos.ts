import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Generate a short-lived upload URL for file storage
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const savePhoto = mutation({
  args: {
    userId: v.id("users"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.optional(v.number()),
    mimeType: v.optional(v.string()),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const photoId = await ctx.db.insert("photos", {
      userId: args.userId,
      storageId: args.storageId,
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
    const photos = await ctx.db
      .query("photos")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    // Get URLs for each photo from storage
    const photosWithUrls = await Promise.all(
      photos.map(async (photo) => {
        const imageUrl = await ctx.storage.getUrl(photo.storageId);
        return {
          ...photo,
          imageUrl,
        };
      })
    );

    return photosWithUrls;
  },
});

export const getAllPhotos = query({
  args: {},
  handler: async (ctx) => {
    const photos = await ctx.db
      .query("photos")
      .order("desc")
      .collect();

    // Fetch user data and image URLs for each photo
    const photosWithUsers = await Promise.all(
      photos.map(async (photo) => {
        const user = await ctx.db.get(photo.userId);
        const imageUrl = await ctx.storage.getUrl(photo.storageId);
        return {
          ...photo,
          imageUrl,
          userName: user?.name || 'Unknown User',
        };
      })
    );

    return photosWithUsers;
  },
});

