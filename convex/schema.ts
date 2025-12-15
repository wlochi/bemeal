import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    name: v.string(),
    createdAt: v.number(),
    lastSignIn: v.number(),
  }).index("by_email", ["email"]),

  photos: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.optional(v.number()),
    mimeType: v.optional(v.string()),
    caption: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
});