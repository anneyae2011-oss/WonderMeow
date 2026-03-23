import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { getStorage, initStorage } from "./storage.js";
import { log } from "./log.js";

// Add global error handlers for serverless stability
process.on("uncaughtException", (err) => {
  console.error("Global Uncaught Exception:", err.message, err.stack);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Global Unhandled Rejection at:", promise, "reason:", reason instanceof Error ? reason.stack : reason);
});

export const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: false, limit: '4mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
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
        const existingAdmin = await getStorage().getAdmin(adminUsername);
        if (!existingAdmin) {
          const { hashPassword } = await import("./auth.js");
          const hashedPassword = hashPassword(adminPassword);
          await getStorage().createAdmin(adminUsername, hashedPassword);
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
        const { setupVite } = await import("./vite.js");
        await setupVite(app, server);
      } else {
        const { serveStatic } = await import("./vite.js");
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
