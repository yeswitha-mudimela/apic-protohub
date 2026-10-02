import { Router, Request, Response, NextFunction } from 'express';
import { ValidationError, UnauthorizedError } from '../middleware/errorHandler';

export const authRouter = Router();

export interface UserSession {
  id: number;
  name: string;
  phone: string;
  role: 'innovator' | 'centre_staff' | 'centre_manager' | 'apis_admin';
  centreId: number | null;
  affiliation?: string | null;
  institution?: string | null;
}

// Canonical demo personas seeded in the database
export const DEMO_PERSONAS: Record<string, UserSession> = {
  ravi: {
    id: 1,
    name: 'Ravi Teja',
    phone: '+919000000001',
    role: 'innovator',
    centreId: null,
    affiliation: 'student',
    institution: 'JNTU Kakinada',
  },
  sneha: {
    id: 2,
    name: 'Sneha Reddy',
    phone: '+919000000002',
    role: 'innovator',
    centreId: null,
    affiliation: 'startup',
    institution: 'HydroFilter Labs',
  },
  prasad: {
    id: 3,
    name: 'K. Prasad',
    phone: '+919000000003',
    role: 'centre_manager',
    centreId: 1, // Visakhapatnam
    affiliation: null,
    institution: null,
  },
  lakshmi: {
    id: 4,
    name: 'M. Lakshmi',
    phone: '+919000000004',
    role: 'centre_staff',
    centreId: 2, // Vijayawada
    affiliation: null,
    institution: null,
  },
  admin: {
    id: 5,
    name: 'APIS Admin',
    phone: '+919000000005',
    role: 'apis_admin',
    centreId: null,
    affiliation: null,
    institution: null,
  },
};

// In-memory simulated OTP store for demo mode (rate-limited, TTL 5 minutes)
interface OtpEntry {
  code: string;
  phone: string;
  expiresAt: number;
  attempts: number;
}
const otpStore = new Map<string, OtpEntry>();

// Active session store for demo mode (keyed by session token)
const sessionStore = new Map<string, UserSession>();

/**
 * Middleware to extract and populate authenticated user from session token
 */
export function sessionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.['protohub_session'] || (req.headers['authorization']?.replace('Bearer ', ''));
  if (token && sessionStore.has(token)) {
    (req as any).user = sessionStore.get(token);
  } else {
    // Default to Ravi Teja (Innovator Student) in local demo mode so shells are immediately interactive
    (req as any).user = DEMO_PERSONAS['ravi'];
  }
  next();
}

/**
 * GET /api/auth/session - Retrieve current session details
 */
authRouter.get('/session', (req: Request, res: Response) => {
  const currentUser: UserSession = (req as any).user || DEMO_PERSONAS['ravi'];
  res.status(200).json({
    authenticated: true,
    user: currentUser,
    availablePersonas: Object.entries(DEMO_PERSONAS).map(([key, p]) => ({
      key,
      id: p.id,
      name: p.name,
      role: p.role,
      centreId: p.centreId,
      affiliation: p.affiliation,
      description: `${p.name} (${p.role.replace('_', ' ')}${p.centreId ? ` — Centre ${p.centreId}` : ''})`,
    })),
  });
});

/**
 * POST /api/auth/switch-persona - Switch active persona for testing
 */
authRouter.post('/switch-persona', (req: Request, res: Response) => {
  const { personaKey } = req.body;
  if (!personaKey || !DEMO_PERSONAS[personaKey]) {
    throw new ValidationError(`Unknown persona: '${personaKey}'. Valid personas: ${Object.keys(DEMO_PERSONAS).join(', ')}`);
  }

  const selectedPersona = DEMO_PERSONAS[personaKey];
  const sessionId = `sess_${personaKey}_${Date.now()}`;
  sessionStore.set(sessionId, selectedPersona);

  res.cookie('protohub_session', sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 86400 * 1000,
  });

  res.status(200).json({
    success: true,
    message: `Switched session to ${selectedPersona.name} (${selectedPersona.role}).`,
    user: selectedPersona,
    sessionId,
  });
});

/**
 * POST /api/auth/otp/send - Send simulated OTP
 */
authRouter.post('/otp/send', (req: Request, res: Response) => {
  const { phone } = req.body;
  if (!phone || typeof phone !== 'string' || phone.length < 10) {
    throw new ValidationError('A valid 10-digit phone number is required.');
  }

  // Generate 6-digit OTP
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(phone, {
    code,
    phone,
    expiresAt: Date.now() + 5 * 60 * 1000,
    attempts: 0,
  });

  res.status(200).json({
    success: true,
    message: 'OTP generated for simulated demo mode (no external SMS transmitted).',
    phone,
    demoOtpDisplay: code, // Displayed in UI during local demo mode
    expiresInSeconds: 300,
  });
});

/**
 * POST /api/auth/otp/verify - Verify OTP and establish session
 */
authRouter.post('/otp/verify', (req: Request, res: Response) => {
  const { phone, code } = req.body;
  if (!phone || !code) {
    throw new ValidationError('Phone and OTP code are required.');
  }

  const entry = otpStore.get(phone);
  if (!entry) {
    throw new UnauthorizedError('No active OTP request found for this phone number. Please request a new one.');
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(phone);
    throw new UnauthorizedError('OTP has expired. Please request a fresh code.');
  }

  entry.attempts += 1;
  if (entry.attempts > 3) {
    otpStore.delete(phone);
    throw new UnauthorizedError('Maximum verification attempts exceeded. Please request a new OTP.');
  }

  if (entry.code !== code.trim()) {
    throw new UnauthorizedError('Invalid verification code.');
  }

  // Matched OTP - clear entry
  otpStore.delete(phone);

  // Match known persona by phone or create guest innovator session
  let matchedPersona = Object.values(DEMO_PERSONAS).find(p => p.phone === phone);
  if (!matchedPersona) {
    matchedPersona = {
      id: 99,
      name: 'Demo Innovator',
      phone,
      role: 'innovator',
      centreId: null,
      affiliation: 'individual',
      institution: null,
    };
  }

  const sessionId = `sess_${matchedPersona.id}_${Date.now()}`;
  sessionStore.set(sessionId, matchedPersona);

  res.cookie('protohub_session', sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 86400 * 1000,
  });

  res.status(200).json({
    success: true,
    message: 'Authentication successful.',
    user: matchedPersona,
    sessionId,
  });
});

/**
 * POST /api/auth/logout - Clear session
 */
authRouter.post('/logout', (req: Request, res: Response) => {
  const token = req.cookies?.['protohub_session'];
  if (token) {
    sessionStore.delete(token);
  }
  res.clearCookie('protohub_session');
  res.status(200).json({
    success: true,
    message: 'Signed out successfully.',
  });
});
