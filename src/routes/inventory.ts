import { Router, Request, Response } from 'express';
import { NotImplementedError } from '../middleware/errorHandler';

export const inventoryRouter = Router();

/**
 * GET /api/inventory - View consumables stock and alerts
 */
inventoryRouter.get('/', (req: Request, res: Response) => {
  throw new NotImplementedError('Inventory tracking and alerts', 'Prompt 19 / Production Workflow & Inventory');
});

/**
 * POST /api/inventory/movement - Record stock movement
 */
inventoryRouter.post('/movement', (req: Request, res: Response) => {
  throw new NotImplementedError('Stock ledger movement', 'Prompt 19 / Production Workflow & Inventory');
});
