import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage, initStorage } from "./storage";
import bcrypt from "bcrypt";

export const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: false, limit: '4mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

let initPromise: Promise<any> | null = null;

async function ensureInitialized() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await initStorage();
    return await registerRoutes(app);
  })();
  return initPromise;
}

(async () => {
  if (!process.env.VERCEL) {
    try {
      const server = await ensureInitialized();

      // Seed initial admin if needed
      const adminUsername = process.env.ADMIN_USERNAME || 'admin';
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
      const existingAdmin = await storage.getAdmin(adminUsername);
      if (!existingAdmin) {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await storage.createAdmin(adminUsername, hashedPassword);
        log(`Created initial admin user: ${adminUsername}`);
      }

      app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
        const status = err.status || err.statusCode || 500;
        const message = err.message || "Internal Server Error";
        res.status(status).json({ message });
      });

      if (app.get("env") === "development") {
        await setupVite(app, server);
      } else {
        serveStatic(app);
      }

      const port = parseInt(process.env.PORT || '5000', 10);
      server.listen({
        port,
        host: "0.0.0.0",
      }, () => {
        log(`serving on port ${port}`);
      });
    } catch (err) {
      console.error("Initialization failed:", err);
    }
  }
})();

export default async (req: any, res: any) => {
  await ensureInitialized();
  return app(req, res);
};
