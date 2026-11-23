import 'dotenv/config';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import { apiRouter } from './src/server/routes/api.ts';
import {
  apiRateLimiter,
  authRateLimiter,
  verifySameOriginCsrf,
} from './src/server/middleware/security.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);

  // Security headers (frameguard & COOP disabled to preserve AI Studio iframe embedding)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      frameguard: false,
    })
  );

  const allowedOrigins = new Set(
    [
      process.env.APP_URL,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]
      .filter(Boolean)
      .map((u) => {
        try {
          return new URL(u as string).origin;
        } catch {
          return String(u);
        }
      })
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (allowedOrigins.has(origin) || origin.endsWith('.run.app') || origin.endsWith('.aistudio.google.com')) {
          callback(null, true);
          return;
        }
        callback(null, true);
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));

  // Rate limiting & CSRF verification for REST API
  app.use('/api/auth', authRateLimiter);
  app.use('/api', apiRateLimiter, verifySameOriginCsrf, apiRouter);

  // Return clean JSON 404 for unknown API paths
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  // Global JSON error handler for malformed payloads etc.
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      res.status(400).json({ error: err.message || 'Invalid request.' });
      return;
    }
    next(err);
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir, { index: false }));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Urban Escape Villa server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Express server:', err);
  process.exit(1);
});
