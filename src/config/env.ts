import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface AppConfig {
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  DEMO_MODE: boolean;
  DATABASE_URL: string;
  PGHOST: string;
  PGPORT: number;
  PGUSER: string;
  PGPASSWORD?: string;
  PGDATABASE: string;
  SESSION_SECRET: string;
  UPLOAD_DIR: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX: number;
}

export interface PublicConfig {
  NODE_ENV: string;
  DEMO_MODE: boolean;
  PORT: number;
  DATABASE_HOST: string;
  DATABASE_PORT: number;
  DATABASE_NAME: string;
}

export function validateEnv(rawEnv: NodeJS.ProcessEnv = process.env): AppConfig {
  const errors: string[] = [];

  // 1. Port validation
  const portStr = rawEnv.PORT || '3000';
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push(`Invalid PORT: '${portStr}'. Must be an integer between 1 and 65535.`);
  }

  // 2. Node Environment
  const rawNodeEnv = rawEnv.NODE_ENV || 'development';
  if (!['development', 'production', 'test'].includes(rawNodeEnv)) {
    errors.push(`Invalid NODE_ENV: '${rawNodeEnv}'. Allowed values: development, production, test.`);
  }
  const nodeEnv = rawNodeEnv as 'development' | 'production' | 'test';

  // 3. Demo Mode
  const demoModeStr = rawEnv.DEMO_MODE?.toLowerCase();
  const demoMode = demoModeStr === 'true' || demoModeStr === '1' || demoModeStr === undefined;

  // 4. Database configuration
  const databaseUrl = rawEnv.DATABASE_URL || 'postgresql://postgres@localhost:5433/protohub';
  const pgHost = rawEnv.PGHOST || 'localhost';
  const pgPortStr = rawEnv.PGPORT || '5433';
  const pgPort = parseInt(pgPortStr, 10);
  if (isNaN(pgPort) || pgPort < 1 || pgPort > 65535) {
    errors.push(`Invalid PGPORT: '${pgPortStr}'. Must be an integer between 1 and 65535.`);
  }
  const pgUser = rawEnv.PGUSER || 'postgres';
  const pgDatabase = rawEnv.PGDATABASE || 'protohub';
  const pgPassword = rawEnv.PGPASSWORD || '';

  // 5. Session Secret
  const sessionSecret = rawEnv.SESSION_SECRET || 'dev_local_demo_session_secret_32_characters_minimum_protohub';
  if (nodeEnv === 'production') {
    if (!rawEnv.SESSION_SECRET || rawEnv.SESSION_SECRET.includes('placeholder') || sessionSecret.length < 32) {
      errors.push('SESSION_SECRET must be at least 32 characters and not a placeholder in production.');
    }
  }

  // 6. Upload Directory
  const uploadDir = rawEnv.UPLOAD_DIR || 'uploads';

  // 7. Rate Limits
  const rateLimitWindow = parseInt(rawEnv.RATE_LIMIT_WINDOW_MS || '60000', 10);
  const rateLimitMax = parseInt(rawEnv.RATE_LIMIT_MAX || '100', 10);

  if (errors.length > 0) {
    throw new Error(`Environment Validation Failed:\n  - ${errors.join('\n  - ')}`);
  }

  return {
    PORT: port,
    NODE_ENV: nodeEnv,
    DEMO_MODE: demoMode,
    DATABASE_URL: databaseUrl,
    PGHOST: pgHost,
    PGPORT: pgPort,
    PGUSER: pgUser,
    PGPASSWORD: pgPassword,
    PGDATABASE: pgDatabase,
    SESSION_SECRET: sessionSecret,
    UPLOAD_DIR: uploadDir,
    RATE_LIMIT_WINDOW_MS: rateLimitWindow,
    RATE_LIMIT_MAX: rateLimitMax,
  };
}

export const env: AppConfig = validateEnv();

/**
 * Returns public-safe configuration, strictly stripping any secrets, passwords, or connection URLs.
 */
export function getPublicConfig(config: AppConfig = env): PublicConfig {
  return {
    NODE_ENV: config.NODE_ENV,
    DEMO_MODE: config.DEMO_MODE,
    PORT: config.PORT,
    DATABASE_HOST: config.PGHOST,
    DATABASE_PORT: config.PGPORT,
    DATABASE_NAME: config.PGDATABASE,
  };
}
