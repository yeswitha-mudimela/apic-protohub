import { Router, Request, Response } from 'express';
import { NotImplementedError } from '../middleware/errorHandler';

export const adminRouter = Router();

/**
 * GET /api/admin/metrics - Statewide network utilization
 */
adminRouter.get('/metrics', (req: Request, res: Response) => {
  throw new NotImplementedError('Statewide network analytics', 'Prompt 20 / Administrator Dashboard');
});

/**
 * GET /api/admin/centres - List all centres with administration metadata
 */
adminRouter.get('/centres', (req: Request, res: Response) => {
  throw new NotImplementedError('Admin centre management', 'Prompt 14 / Centre Catalogue');
});
