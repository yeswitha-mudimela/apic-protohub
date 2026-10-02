import { Router, Request, Response } from 'express';
import { NotImplementedError } from '../middleware/errorHandler';

export const bookingsRouter = Router();

/**
 * POST /api/jobs/:id/book - Reserve slot
 */
bookingsRouter.post('/:id/book', (req: Request, res: Response) => {
  throw new NotImplementedError('Slot reservation', 'Prompt 18 / Booking & Scheduling');
});

/**
 * POST /api/jobs/:id/reschedule - Reschedule slot
 */
bookingsRouter.post('/:id/reschedule', (req: Request, res: Response) => {
  throw new NotImplementedError('Slot rescheduling', 'Prompt 18 / Booking & Scheduling');
});

/**
 * POST /api/jobs/:id/cancel - Cancel booking
 */
bookingsRouter.post('/:id/cancel', (req: Request, res: Response) => {
  throw new NotImplementedError('Booking cancellation', 'Prompt 18 / Booking & Scheduling');
});
