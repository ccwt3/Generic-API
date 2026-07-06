// librarys
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
const app = express();

// modules
import authRouter from "./routes/authRouter.js";
import postsRouter from "./routes/postsRouter.js";
import usersRouter from "./routes/usersRouter.js";
import { corsOptions } from "./config/corsOptions.js";
import { COOKIE_KEY, PORT } from "./config/env.js";

// Types
import type { Request, Response, NextFunction } from "express";

// config
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(COOKIE_KEY));
app.use(cors(corsOptions));

// Limita la fuerza bruta contra login/register/refresh.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// routes middleware
app.use("/auth", authLimiter, authRouter);
app.use("/posts", postsRouter);
app.use("/users", usersRouter);

// error handler global (último middleware: atrapa lo que las capas no manejaron)
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

// running server
app.listen(PORT, (err) => {
  if (err) {
    console.error(err);
  }

  console.log(`Port listening at http://localhost:${PORT}`);
});
