import type { Request, Response } from "express";
import PostsModel from "../models/PostsModel.js";

interface UsersRequest extends Request {
  user?: {
    id: string;
    role: string;
    username: string;
  };
}

export default {
  getMe,
  getMyPosts,
  emptyEndpoint,
};

async function getMe(req: UsersRequest, res: Response) {
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

function emptyEndpoint(req: Request, res: Response) {
  return res.status(200).json({ message: "Empty endpoint" });
}
