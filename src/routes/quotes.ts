import { Router, Request, Response } from 'express';
import { NotImplementedError } from '../middleware/errorHandler';

export const quotesRouter = Router();

/**
 * POST /api/jobs/:id/quote - Manager issues quote
 */
quotesRouter.post('/:id/quote', (req: Request, res: Response) => {
  throw new NotImplementedError('Quotation generation and pricing', 'Prompt 17 / Quotations & Pricing');
});

/**
 * POST /api/jobs/:id/quote/action - Customer accepts or declines quote
 */
quotesRouter.post('/:id/quote/action', (req: Request, res: Response) => {
  throw new NotImplementedError('Quote acceptance or decline', 'Prompt 17 / Quotations & Pricing');
});
