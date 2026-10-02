import { Router } from 'express';
import { healthRouter } from './health';
import { authRouter } from './auth';
import { centresRouter } from './centres';
import { machinesRouter } from './machines';
import { matchRouter } from './match';
import { jobsRouter } from './jobs';
import { quotesRouter } from './quotes';
import { bookingsRouter } from './bookings';
import { inventoryRouter } from './inventory';
import { managerRouter } from './manager';
import { adminRouter } from './admin';
import { systemRouter } from './system';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/centres', centresRouter);
apiRouter.use('/machines', machinesRouter);
apiRouter.use('/match', matchRouter);
apiRouter.use('/jobs', jobsRouter);
apiRouter.use('/quotes', quotesRouter);
apiRouter.use('/bookings', bookingsRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/manager', managerRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/system', systemRouter);
