import type { Response, Request } from "express";
import PostsModel from "../models/PostsModel.js";
import { z } from "zod";

export default {
  postNewPost,
  getPost,
  emptyEndpoint,
  deletePost,
  updatePost,
};

const uuIdSchema = z.string().uuid({ version: "v4" });

function getRequestIds(req: Request) {
  const userId = req.user!.id;
  const postId = req.params.id as string;

  return {
    userId,
    postId,
  };
}

async function updatePost(req: Request, res: Response) {
  const { userId, postId } = getRequestIds(req);
  const result = uuIdSchema.safeParse(postId);
  const newMessage = req.body?.message;

  if (!result.success || typeof newMessage !== "string") {
    return res.status(400).json({
      message: "No given mandatory information",
      details: result.error?.issues || "No message body",
    });
  }

  const response = await PostsModel.updatePost(postId, userId, newMessage);

  if (response.status === 404) {
    return res.status(404).json({ message: "Post not found" });
  }

  if (response.status === 500) {
    return res.status(500).json({ message: "Error updating this post" });
  }

  return res.status(200).json({ message: "Post updated successfully" });
}

async function deletePost(req: Request, res: Response) {
  const { userId, postId } = getRequestIds(req);
  const result = uuIdSchema.safeParse(postId);

  if (!result.success) {
    return res.status(400).json({
      message: "No given mandatory information",
      details: result.error.issues,
    });
  }

  const response = await PostsModel.deleteOnePost(postId, userId);

  if (response.status === 404) {
    return res.status(404).json({ message: "Post not found" });
  }

  if (response.status === 500) {
    return res.status(500).json({ message: "Error deleting the post" });
  }

  return res.status(200).json({ message: "Post deleted successfully" });
}

async function getPost(req: Request, res: Response) {
  const postId = req.params.id as string;
  const userId = req.user?.id ?? "anon";
  const result = uuIdSchema.safeParse(postId);

  if (!result.success) {
    return res.status(400).json({
      message: "No given mandatory information",
      details: result.error.issues,
    });
  }

  const post = await PostsModel.getOnePost(postId, userId);

  if (post.status === 404) {
    return res.status(404).json({ message: "Post not found" });
  }

  if (post.status === 500) {
    return res.status(500).json({ message: "Error fetching the post" });
  }

  return res
    .status(200)
    .json({ message: "Post fetched successfully", post: post.post });
}

async function postNewPost(req: Request, res: Response) {
  if (!req.body || !req.body.title || !req.body.message) {
    return res.status(400).json({ message: "No given mandatory information" });
  }

  const userId = req.user!.id;
  const title = req.body.title;
  const message = req.body.message;

  const newPost = await PostsModel.createPost(userId, title, message);

  if (newPost.status === 500) {
    return res.status(500).json({ message: "Error creating the Post" });
  }

  return res.status(201).json({ message: "Post created successfully" });
}

function emptyEndpoint(req: Request, res: Response) {
  return res.status(200).json({ message: "Empty endpoint" });
}
