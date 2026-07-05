import jwtFC from "../services/jwtFunctions.js";
import userModel from "../models/UsersModel.js";

import type { Request, Response } from "express";

export default {
  authLogin,
  authRegister,
  authRefresh,
  authLogout,
};

type AuthenticatedUser = {
  id: string;
  role: string;
  username: string;
};

const ACCESS_TOKEN_MAX_AGE = 1000 * 60;
const REFRESH_TOKEN_MAX_AGE = 1000 * 60 * 60;

const authCookieOptions = {
  signed: true,
  httpOnly: true,
  secure: process.env.ENVIRONMENT === "production",
  sameSite: "lax" as const,
};

function setAuthCookies(
  res: Response,
  access: string,
  refresh: string,
): Response {
  return res
    .cookie("token", access, {
      ...authCookieOptions,
      maxAge: ACCESS_TOKEN_MAX_AGE,
      path: "/",
    })
    .cookie("refreshToken", refresh, {
      ...authCookieOptions,
      maxAge: REFRESH_TOKEN_MAX_AGE,
      path: "/auth/refresh",
    })
    .cookie("refreshToken", refresh, {
      ...authCookieOptions,
      maxAge: REFRESH_TOKEN_MAX_AGE,
      path: "/auth/logout",
    });
}

function clearAuthCookies(res: Response): Response {
  return res
    .clearCookie("token", { path: "/" })
    .clearCookie("refreshToken", { path: "/auth/refresh" })
    .clearCookie("refreshToken", { path: "/auth/logout" });
}

function credentialsFromRequest(req: Request) {
  const { username, password } = req.body ?? {};

  if (typeof username !== "string" || typeof password !== "string") {
    return null;
  }

  return { username, password };
}

async function createAuthTokens(user: AuthenticatedUser) {
  const accessToken = jwtFC.jwtSignAccess(user);
  const refreshToken = await jwtFC.jwtSignRefresh({ id: user.id });

  if (accessToken.status !== 200 || refreshToken.status !== 200) {
    return { status: 500, message: "Error signing tokens" };
  }

  return {
    status: 200,
    accessToken: accessToken.token!,
    refreshToken: refreshToken.token!,
  };
}

async function authLogin(req: Request, res: Response) {
  const credentials = credentialsFromRequest(req);

  if (!credentials) {
    return res.status(400).json({ message: "No given credentials" });
  }

  const userObj = await userModel.loginUser(
    credentials.username,
    credentials.password,
  );

  switch (userObj.status) {
    case 401:
      return res.status(401).json({ message: "Invalid Credentials" });

    case 500:
      return res.status(500).json({ message: "Error validating credentials" });
    default:
      break;
  }

  const tokens = await createAuthTokens({
    id: userObj.id!,
    role: userObj.role!,
    username: userObj.username!,
  });

  if (tokens.status !== 200) {
    return res.status(500).json({ message: tokens.message });
  }

  return setAuthCookies(res, tokens.accessToken!, tokens.refreshToken!)
    .status(200)
    .json({ message: "User logged in" });
}

async function authRegister(req: Request, res: Response) {
  const credentials = credentialsFromRequest(req);

  if (!credentials) {
    return res.status(400).json({ message: "No given credentials" });
  }

  const userObj = await userModel.registerUser(
    credentials.username,
    credentials.password,
  );

  if (userObj.status === 409) {
    return res.status(409).json({ message: "Username is already in use" });
  } else if (userObj.status === 500) {
    return res.status(500).json({ message: "Error creating user" });
  }

  const tokens = await createAuthTokens({
    id: userObj.id!,
    role: userObj.role!,
    username: userObj.username!,
  });

  if (tokens.status !== 200) {
    return res.status(500).json({ message: tokens.message });
  }

  return setAuthCookies(res, tokens.accessToken!, tokens.refreshToken!)
    .status(201)
    .json({ message: "Register successful" });
}

async function authRefresh(req: Request, res: Response) {
  if (!req.signedCookies || !req.signedCookies.refreshToken) {
    return res.status(400).json({ message: "No given credentials" });
  }

  const refreshToken = req.signedCookies.refreshToken;

  const newRefresh = await jwtFC.rotateRefreshToken(refreshToken);

  if (newRefresh.status !== 200) {
    return clearAuthCookies(res)
      .status(newRefresh.status)
      .json({ message: newRefresh.message });
  }

  const newAccess = await jwtFC.createAccessToken(newRefresh.token!);

  if (newAccess.status !== 200) {
    return res.status(newAccess.status).json({ message: newAccess.message });
  }

  return setAuthCookies(res, newAccess.token!, newRefresh.token!)
    .status(200)
    .json({ message: "Tokens refreshed successfully" });
}

async function authLogout(req: Request, res: Response) {
  if (!req.signedCookies || !req.signedCookies.refreshToken) {
    return res.status(400).json({ message: "No given credentials" });
  }

  const refreshToken = req.signedCookies.refreshToken;
  const result = await jwtFC.jwtLogout(refreshToken);

  return clearAuthCookies(res)
    .status(result.status)
    .json({ message: result.message });
}
