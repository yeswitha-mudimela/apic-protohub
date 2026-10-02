import { Router, Request, Response } from 'express';
import { NotImplementedError } from '../middleware/errorHandler';

export const managerRouter = Router();

/**
 * GET /api/manager/queue - Manager operations queue
 */
managerRouter.get('/queue', (req: Request, res: Response) => {
  throw new NotImplementedError('Manager operations queue', 'Prompt 20 / Manager Dashboard');
});

/**
 * GET /api/manager/today - Today schedule and metrics
 */
managerRouter.get('/today', (req: Request, res: Response) => {
  throw new NotImplementedError('Manager daily schedule', 'Prompt 20 / Manager Dashboard');
});
