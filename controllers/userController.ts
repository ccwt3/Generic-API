import type { Request, Response } from "express";
import PostsModel from "../models/PostsModel.js";

export default {
  getMe,
  getMyPosts,
};

async function getMe(req: Request, res: Response) {
  return res
    .status(200)
    .json({ message: "User details fetched successfully", user: req.user });
}

async function getMyPosts(req: Request, res: Response) {
  const userId = req.user!.id;

  const allPosts = await PostsModel.getAllMyPosts(userId);

  if (allPosts.status === 500)
    return res.status(500).json({ message: "Error fetching the posts" });

  return res.status(200).json({
    message: "All posts fetched successfully",
    posts: allPosts.allPosts,
  });
}
