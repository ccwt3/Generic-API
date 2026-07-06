import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import tokensModel from "../models/tokensModel.js";
import UsersModel from "../models/UsersModel.js";
import {
  JWT_KEY,
  JWT_KEY_REFRESH,
  ACCESS_TOKEN_TTL_S,
  REFRESH_TOKEN_TTL_S,
  REFRESH_TOKEN_GRACE_PERIOD_MS,
} from "../config/env.js";

import type { JwtPayload } from "jsonwebtoken";

export default {
  jwtVerifyAccess,
  jwtSignAccess,
  jwtSignRefresh,
  createAccessToken,
  rotateRefreshToken,
  jwtLogout,
};

type AccessPayload = {
  id: string;
  role: string;
  username: string;
};

type RefreshPayload = JwtPayload & {
  userId: string;
};

type TokenResult = {
  status: number;
  message: string;
  token?: string;
};

type AccessVerificationResult =
  | { status: 200; message: string; payload: AccessPayload }
  | { status: 401; message: string };

type RefreshVerificationResult =
  | { status: 200; message: string; payload: RefreshPayload }
  | { status: 401; message: string };

const refreshTokenGraceCache = new Map<
  string,
  { token: string; expiresAt: number }
>();

function isAccessPayload(payload: string | JwtPayload): payload is AccessPayload {
  return (
    typeof payload !== "string" &&
    typeof payload.id === "string" &&
    typeof payload.role === "string" &&
    typeof payload.username === "string"
  );
}

function isRefreshPayload(
  payload: string | JwtPayload,
): payload is RefreshPayload {
  return typeof payload !== "string" && typeof payload.userId === "string";
}

function signRefreshTokenValue(userId: string) {
  return jwt.sign({ userId, jti: randomUUID() }, JWT_KEY_REFRESH, {
    expiresIn: REFRESH_TOKEN_TTL_S,
  });
}

function pruneRefreshTokenGraceCache() {
  const now = Date.now();

  for (const [tokenId, cachedToken] of refreshTokenGraceCache) {
    if (cachedToken.expiresAt <= now) {
      refreshTokenGraceCache.delete(tokenId);
    }
  }
}

function rememberRefreshTokenForGracePeriod(tokenId: string, token: string) {
  pruneRefreshTokenGraceCache();
  refreshTokenGraceCache.set(tokenId, {
    token,
    expiresAt: Date.now() + REFRESH_TOKEN_GRACE_PERIOD_MS,
  });
}

function getRefreshTokenFromGracePeriod(tokenId: string) {
  const cachedToken = refreshTokenGraceCache.get(tokenId);

  if (!cachedToken) {
    return null;
  }

  if (cachedToken.expiresAt <= Date.now()) {
    refreshTokenGraceCache.delete(tokenId);
    return null;
  }

  return cachedToken.token;
}

async function jwtSignRefresh(payload: { id: string }): Promise<TokenResult> {
  try {
    const token = signRefreshTokenValue(payload.id);
    const storedToken = await tokensModel.storeToken(token, payload.id);

    if (storedToken.status !== 200) {
      return { status: 500, message: "Error storing refresh token" };
    }

    return { status: 200, token, message: "" };
  } catch (error) {
    console.error("Error signing refresh token:", error);
    return { status: 500, message: "Error signing refresh token" };
  }
}

function jwtSignAccess(payload: AccessPayload): TokenResult {
  try {
    const token = jwt.sign(payload, JWT_KEY, {
      expiresIn: ACCESS_TOKEN_TTL_S,
    });
    return { status: 200, token, message: "" };
  } catch (error) {
    console.error("Error signing access token:", error);
    return { status: 500, message: "Error signing access token" };
  }
}

function jwtVerifyAccess(token: string): AccessVerificationResult {
  try {
    const payload = jwt.verify(token, JWT_KEY);

    if (!isAccessPayload(payload)) {
      return { status: 401, message: "Invalid token payload" };
    }

    return { status: 200, payload, message: "" };
  } catch (error) {
    console.error("Error verifying access token:", error);
    return { status: 401, message: "Invalid token" };
  }
}

function jwtVerifyRefresh(token: string): RefreshVerificationResult {
  try {
    const payload = jwt.verify(token, JWT_KEY_REFRESH);

    if (!isRefreshPayload(payload)) {
      return { status: 401, message: "Invalid token payload" };
    }

    return { status: 200, payload, message: "" };
  } catch (error) {
    console.error("Error verifying refresh token:", error);
    return { status: 401, message: "Invalid token" };
  }
}

async function jwtLogout(token: string): Promise<TokenResult> {
  const userData = jwtVerifyRefresh(token);

  if (userData.status !== 200) {
    return userData;
  }

  const result = await tokensModel.deleteToken(token, userData.payload.userId);

  switch (result.status) {
    case 403:
      return { status: 403, message: "Reused token" };

    case 500:
      return { status: 500, message: "Error logging out" };

    default:
      return { status: result.status, message: "User logged out successfully" };
  }
}

async function createAccessToken(token: string): Promise<TokenResult> {
  const userData = jwtVerifyRefresh(token);

  if (userData.status !== 200) {
    return userData;
  }

  const userObj = await UsersModel.getUser(userData.payload.userId);

  switch (userObj.status) {
    case 404:
      return { status: 404, message: "User not found" };

    case 500:
      return { status: 500, message: "Error fetching user" };

    default:
      break;
  }

  return jwtSignAccess({
    id: userObj.user!.id,
    role: userObj.user!.role,
    username: userObj.user!.username,
  });
}

async function rotateRefreshToken(token: string): Promise<TokenResult> {
  const userData = jwtVerifyRefresh(token);

  if (userData.status !== 200) {
    return userData;
  }

  const newRefreshToken = signRefreshTokenValue(userData.payload.userId);
  const result = await tokensModel.rotateToken(
    token,
    newRefreshToken,
    userData.payload.userId,
  );

  switch (result.status) {
    case 403:
      return { status: 403, message: result.message || "Reused token" };

    case 500:
      return {
        status: 500,
        message: result.message || "Error rotating refresh token",
      };

    default:
      break;
  }

  if (result.reusedWithinGrace) {
    if (!result.replacedBy) {
      return { status: 500, message: "Replacement token not found" };
    }

    const cachedRefreshToken = getRefreshTokenFromGracePeriod(
      result.replacedBy,
    );

    if (!cachedRefreshToken) {
      return { status: 409, message: "Replacement token is no longer cached" };
    }

    return { status: 200, token: cachedRefreshToken, message: "" };
  }

  if (!result.row) {
    return { status: 500, message: "Error rotating refresh token" };
  }

  rememberRefreshTokenForGracePeriod(result.row, newRefreshToken);

  return { status: 200, token: newRefreshToken, message: "" };
}
