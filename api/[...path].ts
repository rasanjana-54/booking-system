import { createApp } from '../src/server/app.ts';
import type { Request, Response } from 'express';

const app = createApp();

export default function handler(req: Request, res: Response): void {
  app(req, res);
}
