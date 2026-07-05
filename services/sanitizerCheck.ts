import type { Response, Request, NextFunction } from "express";
import { validationResult } from "express-validator";

// this middleware will sanitize the inputs of the login / register page
export default function sanitizerCheck(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.mapped() });
  }

  return next();
}
