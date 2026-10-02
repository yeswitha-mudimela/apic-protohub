import { Router, Request, Response } from 'express';
import { NotImplementedError } from '../middleware/errorHandler';

export const centresRouter = Router();

// Seeded APIC centres in Andhra Pradesh
export const CANONICAL_CENTRES = [
  { id: 1, name: 'APIC Visakhapatnam', district: 'Visakhapatnam', campus: 'AU Engineering College Campus', phone: '0891-2844000', lat: 17.730000, lng: 83.319000, isLive: true },
  { id: 2, name: 'APIC Vijayawada', district: 'NTR', campus: 'Siddhartha Engineering College', phone: '0866-2582333', lat: 16.506100, lng: 80.648000, isLive: true },
  { id: 3, name: 'APIC Tirupati', district: 'Tirupati', campus: 'SVU Campus', phone: '0877-2289000', lat: 13.628700, lng: 79.419200, isLive: true },
  { id: 4, name: 'APIC Kakinada', district: 'Kakinada', campus: 'JNTU-K Campus', phone: '0884-2300900', lat: 16.989400, lng: 82.247500, isLive: true },
  { id: 5, name: 'APIC Anantapur', district: 'Anantapur', campus: 'JNTU-A Campus', phone: '08554-272000', lat: 14.681500, lng: 77.600400, isLive: false },
];

/**
 * GET /api/centres - List APIC network centres
 */
centresRouter.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    total: CANONICAL_CENTRES.length,
    centres: CANONICAL_CENTRES,
  });
});

/**
 * GET /api/centres/:id - Get centre details
 */
centresRouter.get('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const centre = CANONICAL_CENTRES.find(c => c.id === id);
  if (!centre) {
    res.status(404).json({ error: { code: 'CENTRE_NOT_FOUND', message: `Centre ID ${id} not found.` } });
    return;
  }
  res.status(200).json({ centre });
});

/**
 * PATCH /api/centres/:id/live - Commission / decommission centre (Admin only)
 */
centresRouter.patch('/:id/live', (req: Request, res: Response) => {
  throw new NotImplementedError('Centre commissioning persistence', 'Prompt 14 / Database Integration');
});
