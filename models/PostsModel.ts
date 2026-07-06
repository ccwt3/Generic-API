import { prisma } from "../prisma/lib/prisma.js";

export default {
  createPost,
  getAllMyPosts,
  getPublicPosts,
  getOnePost,
  deleteOnePost,
  updatePost,
  setPublishStatus,
};

async function createPost(id: string, title: string, message: string) {
  try {
    await prisma.post.create({
      data: {
        author_id: id,
        title,
        message,
      },
    });

    return { status: 201 };
  } catch (error) {
    console.error("Error creating post:", error);
    return { status: 500 };
  }
}

async function getAllMyPosts(id: string) {
  try {
    const allPosts = await prisma.post.findMany({
      where: {
        author_id: id,
      },
      orderBy: {
        published_time: "desc",
      },
    });

    return { status: 200, allPosts };
  } catch (error) {
    console.error("Error fetching posts:", error);
    return { status: 500 };
  }
}

async function getPublicPosts() {
  try {
    const posts = await prisma.post.findMany({
      where: {
        is_published: true,
      },
      orderBy: {
        published_time: "desc",
      },
    });

    return { status: 200, posts };
  } catch (error) {
    console.error("Error fetching public posts:", error);
    return { status: 500 };
  }
}

async function getOnePost(postId: string, userId: string) {
  try {
    const post = await prisma.post.findUnique({
      where: {
        id: postId,
      },
    });

    if (!post || (post.is_published === false && post.author_id !== userId)) {
      return { status: 404 };
    }

    return { status: 200, post };
  } catch (error) {
    console.error("Error fetching post:", error);
    return { status: 500 };
  }
}

async function deleteOnePost(postId: string, userId: string) {
  try {
    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        author_id: userId,
      },
    });

    if (!post) {
      return { status: 404 };
    }

    await prisma.post.delete({
      where: {
        id: post.id,
      },
    });

    return { status: 200 };
  } catch (error) {
    console.error("Error deleting post:", error);
    return { status: 500 };
  }
}

async function updatePost(postId: string, userId: string, newMessage: string) {
  try {
    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        author_id: userId,
      },
    });

    if (!post) {
      return { status: 404 };
    }

    await prisma.post.update({
      where: {
        id: post.id,
      },
      data: {
        message: newMessage,
      },
    });

    return { status: 200 };
  } catch (error) {
    console.error("Error updating post:", error);
    return { status: 500 };
  }
}

async function setPublishStatus(
  postId: string,
  userId: string,
  isPublished: boolean,
) {
  try {
    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        author_id: userId,
      },
    });

    if (!post) {
      return { status: 404 };
    }

    await prisma.post.update({
      where: {
        id: post.id,
      },
      data: {
        is_published: isPublished,
      },
    });

    return { status: 200 };
  } catch (error) {
    console.error("Error updating publish status:", error);
    return { status: 500 };
  }
}
