import { Router, Request, Response } from 'express';
import { getPublicConfig } from '../config/env';

export const healthRouter = Router();

const startTime = Date.now();

healthRouter.get('/', (req: Request, res: Response) => {
  const publicConfig = getPublicConfig();
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  // Return public operational health info strictly without exposing secrets
  res.status(200).json({
    status: 'ok',
    service: 'APIC ProtoHub API',
    version: '1.0.0',
    environment: publicConfig.NODE_ENV,
    demoMode: publicConfig.DEMO_MODE,
    uptimeSeconds,
    timestamp: new Date().toISOString(),
    system: {
      platform: process.platform,
      nodeVersion: process.version,
      memoryUsageMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    database: {
      targetHost: publicConfig.DATABASE_HOST,
      targetPort: publicConfig.DATABASE_PORT,
      targetDatabase: publicConfig.DATABASE_NAME,
      status: 'configured',
    },
  });
});
