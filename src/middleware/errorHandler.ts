import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(message: string, statusCode = 500, errorCode = 'INTERNAL_ERROR', details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: any) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request parameters', details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', details?: any) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied for current role or centre', details?: any) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict or concurrency collision', details?: any) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class NotImplementedError extends AppError {
  constructor(featureName = 'This feature', plannedPhase = 'subsequent phase') {
    super(
      `${featureName} is not yet implemented (scheduled for ${plannedPhase}).`,
      501,
      'NOT_IMPLEMENTED',
      { phase: plannedPhase }
    );
  }
}

/**
 * Middleware to assign or propagate correlation IDs
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = (req.headers['x-correlation-id'] as string) || `req_${crypto.randomBytes(8).toString('hex')}`;
  (req as any).correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
}

/**
 * Centralized 404 Not Found Handler
 */
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  const correlationId = (req as any).correlationId || 'unknown';
  const isApi = req.path.startsWith('/api/') || req.xhr || req.headers.accept?.includes('application/json');

  if (isApi) {
    res.status(404).json({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Endpoint '${req.method} ${req.path}' not found.`,
        correlationId,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // HTML fallback for browser routes
  res.status(404).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>404 Not Found — APIC ProtoHub</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #f8f9ff; color: #0b1c30; padding: 40px; text-align: center; }
        .card { max-width: 500px; margin: 60px auto; background: white; border: 1px solid #c4c5d7; padding: 32px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        h1 { color: #0037b0; margin-top: 0; font-size: 24px; }
        p { color: #434655; line-height: 1.5; }
        a { display: inline-block; margin-top: 16px; background: #0037b0; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none; font-weight: 500; }
        .ref { font-family: monospace; font-size: 11px; color: #747686; margin-top: 24px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Page Not Found (404)</h1>
        <p>The requested page <code>${req.path}</code> does not exist on APIC ProtoHub.</p>
        <a href="/">Return to Dashboard</a>
        <div class="ref">Correlation ID: ${correlationId}</div>
      </div>
    </body>
    </html>
  `);
}

/**
 * Centralized Error Handling Middleware
 */
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  const correlationId = (req as any).correlationId || 'unknown';
  const statusCode = err.statusCode || (err.status ? err.status : 500);
  const errorCode = err.errorCode || 'INTERNAL_SERVER_ERROR';

  // Ensure internal details or DB secrets are never exposed on 500 errors
  const isProduction = process.env.NODE_ENV === 'production';
  let message = err.message;

  if (statusCode === 500 && isProduction) {
    message = 'An unexpected internal error occurred. Please contact the administrator with the correlation ID.';
  }

  // Safe operational logging without leaking client body secrets
  console.error(`[ERROR] [${correlationId}] ${req.method} ${req.path} -> ${statusCode} (${errorCode}):`, err.stack || err.message);

  res.status(statusCode).json({
    error: {
      code: errorCode,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      ...(err.details ? { details: err.details } : {}),
    },
  });
}
