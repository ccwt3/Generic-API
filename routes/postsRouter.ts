import { Router } from "express";

import postController from "../controllers/postsController.js";
import checkToken from "../services/checkToken.js";
import { checkTokenForAnon } from "../services/checkToken.js";

import postValidatorChain from "../services/validation/postValidatorChain.js";
import postUpdateValidatorChain from "../services/validation/postUpdateValidatorChain.js";
import publishValidatorChain from "../services/validation/publishValidatorChain.js";
import sanitizerCheck from "../services/sanitizerCheck.js";

const postsRouter: Router = Router();
export default postsRouter;

// Listado público: no requiere auth, solo devuelve posts publicados.
postsRouter.get("/", postController.getPublicPosts);
postsRouter.get("/:id", checkTokenForAnon, postController.getPost);

postsRouter.post(
  "/",
  checkToken,
  postValidatorChain,
  sanitizerCheck,
  postController.postNewPost,
);

postsRouter.patch(
  "/:id",
  checkToken,
  postUpdateValidatorChain,
  sanitizerCheck,
  postController.updatePost,
);

// Acción de estado: publica/despublica un post propio.
postsRouter.patch(
  "/:id/publish",
  checkToken,
  publishValidatorChain,
  sanitizerCheck,
  postController.setPublishStatus,
);

postsRouter.delete("/:id", checkToken, postController.deletePost);
