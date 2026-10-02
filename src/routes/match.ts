import { Router, Request, Response } from 'express';
import { NotImplementedError } from '../middleware/errorHandler';

export const matchRouter = Router();

/**
 * POST /api/match - Guided capability matching engine
 */
matchRouter.post('/', (req: Request, res: Response) => {
  throw new NotImplementedError('Guided machine matching engine', 'Prompt 15 / Capability Matching & Availability');
});
