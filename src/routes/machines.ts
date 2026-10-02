import { Router, Request, Response } from 'express';
import { NotImplementedError } from '../middleware/errorHandler';

export const machinesRouter = Router();

/**
 * GET /api/machines - List machines with capabilities
 */
machinesRouter.get('/', (req: Request, res: Response) => {
  throw new NotImplementedError('Machine catalogue listing', 'Prompt 14 / Database Integration');
});

/**
 * GET /api/machines/:id - Get specific machine capability and materials
 */
machinesRouter.get('/:id', (req: Request, res: Response) => {
  throw new NotImplementedError('Machine detail specification', 'Prompt 14 / Database Integration');
});

/**
 * GET /api/machines/:id/slots - Free slots query
 */
machinesRouter.get('/:id/slots', (req: Request, res: Response) => {
  throw new NotImplementedError('Free slot query', 'Prompt 15 / Capability Matching & Availability');
});
