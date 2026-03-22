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

(async () => {
  await initStorage();
  const server = await registerRoutes(app);

  // Seed initial admin if needed
  try {
    const adminUsername = process.env.ADMIN_USERNAME || "admin";
    const existingAdmin = await storage.getAdmin(adminUsername);

    if (!existingAdmin) {
      const password = process.env.ADMIN_PASSWORD || "enyapeakshit";
      const hashedPassword = await bcrypt.hash(password, 10);
      await storage.createAdmin(adminUsername, hashedPassword);
      log(`Created initial admin user: ${adminUsername}`);
    }

    // Seed system config if needed (important for Postgres)
    try {
      const authMode = await storage.getAuthMode();
      // If getAuthMode returns default because it's missing, let's ensure it's in the DB
      // Note: getAuthMode currently handles defaults, but we want it persistent.
    } catch (e) {
      // Handle potential errors if tables are empty
    }
  } catch (error) {
    console.error("Failed to seed initial admin:", error);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  if (!process.env.VERCEL) {
    const port = parseInt(process.env.PORT || '5000', 10);
    server.listen({
      port,
      host: "0.0.0.0",
      // reusePort: true,
    }, () => {
      log(`serving on port ${port}`);
    });
  }
})();
