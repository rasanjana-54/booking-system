import type { Request, Response } from 'express';

let appPromise: Promise<import('express').Express> | undefined;

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    if (!appPromise) {
      appPromise = import('../src/server/app.ts').then(({ createApp }) => createApp());
    }

    const app = await appPromise;
    app(req, res);
  } catch (error) {
    console.error('Failed to initialize the API serverless function:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'The API service failed to initialize.' });
    }
  }
}
