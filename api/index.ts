import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "../server/routes";
import { setupVite, serveStatic, log } from "../server/vite";
import { storage, initStorage } from "../server/storage";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Add global error handlers for serverless stability
process.on("uncaughtException", (err) => {
  console.error("Global Uncaught Exception:", err);
  // In serverless, we might not be able to do much here, but logging helps.
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Global Unhandled Rejection at:", promise, "reason:", reason);
});

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
    try {
      await initStorage();
      return await registerRoutes(app);
    } catch (err) {
      console.error("Failed to initialize storage or routes:", err);
      throw err;
    }
  })();
  return initPromise;
}

(async () => {
  // Only start the server if not running on Vercel. 
  // Vercel handles the application lifecycle itself.
  if (!process.env.VERCEL) {
    try {
      const server = await ensureInitialized();

      // Seed initial admin if needed (local only)
      try {
        const adminUsername = process.env.ADMIN_USERNAME || 'enyapeakshit';
        const adminPassword = process.env.ADMIN_PASSWORD || 'enyapeakshit';
        const existingAdmin = await storage.getAdmin(adminUsername);
        if (!existingAdmin) {
          const bcrypt = require("bcrypt");
          const hashedPassword = await bcrypt.hash(adminPassword, 10);
          await storage.createAdmin(adminUsername, hashedPassword);
          log(`Created initial admin user: ${adminUsername}`);
        }
      } catch (err) {
        log(`Error seeding admin: ${err}`);
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
      console.error("Startup sequence failed:", err);
    }
  }
})();

// For Vercel, we export the app instance wrapped in an initialization waiter.
export default async (req: any, res: any) => {
  try {
    await ensureInitialized();
    return app(req, res);
  } catch (err: any) {
    console.error("Vercel Invocation Error:", err);
    res.status(500).send(`Application Initialization Error: ${err.message}`);
  }
};
