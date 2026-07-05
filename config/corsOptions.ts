export const corsOptions = {
  origin: "http://localhost:5173",
  optionsSuccessStatus: 200,
  credentials: true,
  allowedHeaders: ["Content-Type"],
  methods: ["POST", "GET", "PUT", "DELETE"],
};
