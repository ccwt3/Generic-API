import type { Response, Request, NextFunction } from "express";
import jwtFC from "./jwtFunctions.js";

function attachUserFromAccessToken(req: Request) {
  const tokenCookie = req.signedCookies?.token;

  if (!tokenCookie) {
    return { status: 400, message: "No given token" };
  }

  const userInfo = jwtFC.jwtVerifyAccess(tokenCookie);

  if (userInfo.status !== 200) {
    return { status: 401, message: "Unauthorized" };
  }

  req.user = userInfo.payload;
  return { status: 200 };
}

export default function checkToken(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const result = attachUserFromAccessToken(req);

  if (result.status !== 200) {
    return res.status(result.status).json({ message: result.message });
  }

  return next();
}

export function checkTokenForAnon(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.signedCookies?.token) {
    return next();
  }

  const result = attachUserFromAccessToken(req);

  if (result.status !== 200) {
    return res.status(result.status).json({ message: result.message });
  }

  return next();
}
