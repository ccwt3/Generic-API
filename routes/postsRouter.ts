import { Router } from "express";

import postController from "../controllers/postsController.js";
import checkToken from "../services/chekToken.js";
import { checkTokenForAnon } from "../services/chekToken.js";

import postValidatorChain from "../services/validation/postValidatorChain.js";
import postUpdateValidatorChain from "../services/validation/postUpdateValidatorChain.js";
import sanitizerCheck from "../services/sanitizerCheck.js";

const postsRouter: Router = Router();
export default postsRouter;

postsRouter.get("/", checkToken, postController.emptyEndpoint);
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

postsRouter.delete("/:id", checkToken, postController.deletePost);
