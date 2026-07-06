import { CORS_ORIGIN } from "./env.js";

export const corsOptions = {
  origin: CORS_ORIGIN,
  optionsSuccessStatus: 200,
  credentials: true,
  allowedHeaders: ["Content-Type"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
};
