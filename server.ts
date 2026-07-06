import app from "./app.js";
import { PORT } from "./config/env.js";

app.listen(PORT, (err) => {
  if (err) {
    console.error(err);
  }

  console.log(`Port listening at http://localhost:${PORT}`);
});
