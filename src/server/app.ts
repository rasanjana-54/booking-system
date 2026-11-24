import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { apiRouter } from './routes/api.ts';
import {
  apiRateLimiter,
  authRateLimiter,
  verifySameOriginCsrf,
} from './middleware/security.ts';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      frameguard: false,
    })
  );

  const allowedOrigins = new Set(
    [process.env.APP_URL, 'http://localhost:3000', 'http://127.0.0.1:3000']
      .filter(Boolean)
      .map((origin) => {
        try {
          return new URL(origin as string).origin;
        } catch {
          return String(origin);
        }
      })
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (
          !origin ||
          allowedOrigins.has(origin) ||
          origin.endsWith('.run.app') ||
          origin.endsWith('.aistudio.google.com')
        ) {
          callback(null, true);
          return;
        }
        callback(null, true);
      },
      credentials: true,
    })
  );

  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buffer) => {
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
      },
    })
  );
  app.use('/api/auth', authRateLimiter);
  app.use('/api', apiRateLimiter, verifySameOriginCsrf, apiRouter);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      res.status(400).json({ error: err.message || 'Invalid request.' });
      return;
    }
    next(err);
  });

  return app;
}
