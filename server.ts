import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import geminiHandler from "./api/gemini";
import healthHandler from "./api/health";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: true, limit: "20mb" }));

  app.all("/api/gemini", async (req, res) => {
    try {
      await geminiHandler(req, res);
    } catch (error: any) {
      console.error("[Local server] /api/gemini:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: error?.message || "Lỗi xử lý yêu cầu" });
      }
    }
  });

  app.all("/api/health", async (req, res) => {
    try {
      await healthHandler(req, res);
    } catch (error: any) {
      console.error("[Local server] /api/health:", error);
      if (!res.headersSent) {
        res.status(500).json({ ok: false });
      }
    }
  });

  if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Local server] Nông Nghiệp Bát Xát V2: http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Không thể khởi động máy chủ:", error);
  process.exit(1);
});
