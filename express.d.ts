// src/express.d.ts
import "express";

declare module "express" {
  interface Request {
    user?: {
      id: string;
      role: string;
      username: string;
    };
  }
}