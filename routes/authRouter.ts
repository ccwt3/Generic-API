import authController from "../controllers/authController.js";
import { Router } from "express";
import sanitizerCheck from "../services/sanitizerCheck.js";
import authValidatorChain from "../services/validation/authValidatorChain.js";

const authRouter: Router = Router();
export default authRouter;

authRouter.post(
  "/login",
  authValidatorChain,
  sanitizerCheck,
  authController.authLogin,
);
authRouter.post(
  "/register",
  authValidatorChain,
  sanitizerCheck,
  authController.authRegister,
);

authRouter.post("/refresh", authController.authRefresh);
authRouter.post("/logout", authController.authLogout);
