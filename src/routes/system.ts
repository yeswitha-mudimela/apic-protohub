import { Router, Request, Response } from 'express';
import { NotImplementedError } from '../middleware/errorHandler';

export const systemRouter = Router();

/**
 * POST /api/system/reset - Reset demo database to deterministic baseline
 */
systemRouter.post('/reset', (req: Request, res: Response) => {
  throw new NotImplementedError('System reset adapter', 'Prompt 22 / Demo Experience & Reset');
});
