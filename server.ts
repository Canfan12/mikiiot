import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import apiApp from "./api/index.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use((req, res, next) => {
    console.log("INCOMING:", req.method, req.url);
    next();
  });

  // Mount API endpoints on the root
  app.use("/", apiApp);

  // Vite middleware for serving standard HTML/CSS/JS frontend
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa", // changed from custom since we're using index.html
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files from root directory assuming we have index.html, style.css, app.js
    // or from a "public" folder. Let's serve static from current working directory
    // as we will place index.html directly.
    app.use(express.static(process.cwd()));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
