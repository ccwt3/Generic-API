// librarys
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
const app = express();

// modules
import authRouter from "./routes/authRouter.js";
import postsRouter from "./routes/postsRouter.js";
import usersRouter from "./routes/usersRouter.js";
import { corsOptions } from "./config/corsOptions.js";

// Types
import type {
  Request,
  Response,
  ErrorRequestHandler,
  NextFunction,
} from "express";

// config
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_KEY));
app.use(cors(corsOptions));

// routes middleware
app.use("/auth", authRouter);
app.use("/posts", postsRouter);
app.use("/users", usersRouter);

// running server
app.use(
  (
    err: ErrorRequestHandler,
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ message: "idk what happend mate" });
  },
);

app.listen(3000, (err) => {
  if (err) {
    console.error(err);
  }

  console.log(`Port listening at http://localhost:3000`);
});
