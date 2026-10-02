import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import { apiRouter } from './routes';
import { correlationIdMiddleware, notFoundHandler, errorHandler } from './middleware/errorHandler';
import { sessionMiddleware } from './routes/auth';

/**
 * Lightweight cookie parser middleware
 */
function cookieParser(req: Request, res: Response, next: NextFunction): void {
  const cookieHeader = req.headers.cookie;
  (req as any).cookies = {};
  if (cookieHeader) {
    const rawCookies = cookieHeader.split(';');
    for (const cookie of rawCookies) {
      const parts = cookie.split('=');
      const name = parts[0]?.trim();
      const val = parts.slice(1).join('=').trim();
      if (name) {
        (req as any).cookies[name] = decodeURIComponent(val);
      }
    }
  }
  next();
}

export function createApp(): Express {
  const app = express();

  // Basic security and parsing middlewares
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser);
  app.use(correlationIdMiddleware);
  app.use(sessionMiddleware);

  // Serve static public assets (Stitch shells, styles, scripts)
  app.use(express.static(path.resolve(process.cwd(), 'public')));

  // Mount API router
  app.use('/api', apiRouter);

  // Route fallbacks and role navigation shells
  app.get('/customer', (req: Request, res: Response) => {
    res.sendFile(path.resolve(process.cwd(), 'public', 'customer.html'));
  });

  app.get('/staff', (req: Request, res: Response) => {
    res.sendFile(path.resolve(process.cwd(), 'public', 'staff.html'));
  });

  app.get('/manager', (req: Request, res: Response) => {
    res.sendFile(path.resolve(process.cwd(), 'public', 'manager.html'));
  });

  app.get('/admin', (req: Request, res: Response) => {
    res.sendFile(path.resolve(process.cwd(), 'public', 'admin.html'));
  });

  // Centralized 404 handler
  app.use(notFoundHandler);

  // Centralized Error handler
  app.use(errorHandler);

  return app;
}
