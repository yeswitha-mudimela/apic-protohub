import { Router, Request, Response } from 'express';
import { NotImplementedError } from '../middleware/errorHandler';

export const jobsRouter = Router();

/**
 * GET /api/jobs - List scoped jobs
 */
jobsRouter.get('/', (req: Request, res: Response) => {
  throw new NotImplementedError('Job tracking and list', 'Prompt 16 / Customer Job Submission');
});

/**
 * POST /api/jobs - Create new job with CAD file upload
 */
jobsRouter.post('/', (req: Request, res: Response) => {
  throw new NotImplementedError('Job creation and file upload', 'Prompt 16 / Customer Job Submission');
});

/**
 * GET /api/jobs/:id - Detailed job view with events and files
 */
jobsRouter.get('/:id', (req: Request, res: Response) => {
  throw new NotImplementedError('Job detail view', 'Prompt 16 / Customer Job Submission');
});

/**
 * POST /api/jobs/:id/transition - Transition job state
 */
jobsRouter.post('/:id/transition', (req: Request, res: Response) => {
  throw new NotImplementedError('Job state transition', 'Prompt 19 / Production Workflow');
});
