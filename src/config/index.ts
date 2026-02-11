import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

/**
 * Configuration interface defining all available config options
 */
export interface Config {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  logFile?: string;
  graphqlIntrospection: boolean;
  maxQueryDepth: number;
  requestTimeoutMs: number;
}

/**
 * Environment variable interface (allows partial config from env)
 */
interface EnvVars {
  NODE_ENV?: string;
  PORT?: string;
  LOG_LEVEL?: string;
  LOG_FILE?: string;
  GRAPHQL_INTROSPECTION?: string;
  MAX_QUERY_DEPTH?: string;
  REQUEST_TIMEOUT_MS?: string;
}

/**
 * Load and parse environment variables from .env file
 */
function loadEnvFile(): EnvVars {
  const envPath = path.resolve(process.cwd(), '.env');

  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (result.error && (result.error as any).code !== 'ENOENT') {
      // File exists but has parse error
      throw new Error(`Failed to parse .env file: ${result.error.message}`);
    }
    return result.parsed || {};
  }

  // .env file doesn't exist, that's OK - use only process.env
  return {};
}

/**
 * Validate a log level string
 */
function validateLogLevel(value: string): boolean {
  return ['error', 'warn', 'info', 'debug'].includes(value.toLowerCase());
}

/**
 * Validate a port number
 */
function validatePort(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 65535;
}

/**
 * Create and validate configuration from environment
 * @throws Error if required configuration is missing or invalid
 * @returns Typed configuration object
 */
export function createConfig(): Config {
  // Load from .env file
  loadEnvFile();

  // Merge .env with process.env (process.env takes precedence)
  const env: EnvVars = {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    LOG_LEVEL: process.env.LOG_LEVEL,
    LOG_FILE: process.env.LOG_FILE,
    GRAPHQL_INTROSPECTION: process.env.GRAPHQL_INTROSPECTION,
    MAX_QUERY_DEPTH: process.env.MAX_QUERY_DEPTH,
    REQUEST_TIMEOUT_MS: process.env.REQUEST_TIMEOUT_MS,
  };

  // Apply defaults and validate
  const nodeEnv = env.NODE_ENV || 'development';
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error(
      `Invalid NODE_ENV "${nodeEnv}". Must be one of: development, production, test`,
    );
  }

  // In test mode, always use port 0 (OS-assigned) to avoid port conflicts
  const port = nodeEnv === 'test' ? 0 : (env.PORT ? parseInt(env.PORT, 10) : 3000);
  if (isNaN(port) || (port === 0 && nodeEnv !== 'test') || (port !== 0 && !validatePort(port))) {
    throw new Error(`Invalid PORT "${env.PORT}". Must be a number between 1 and 65535 (0 allowed in test mode).`);
  }

  const logLevel = env.LOG_LEVEL || 'info';
  if (!validateLogLevel(logLevel)) {
    throw new Error(
      `Invalid LOG_LEVEL "${logLevel}". Must be one of: error, warn, info, debug`,
    );
  }

  // SECURITY: Default introspection to false in production (SEC-008)
  const graphqlIntrospection = env.GRAPHQL_INTROSPECTION === 'true' ||
    (env.GRAPHQL_INTROSPECTION !== 'false' && nodeEnv !== 'production');
  const maxQueryDepth = env.MAX_QUERY_DEPTH ? parseInt(env.MAX_QUERY_DEPTH, 10) : 10;
  const requestTimeoutMs = env.REQUEST_TIMEOUT_MS
    ? parseInt(env.REQUEST_TIMEOUT_MS, 10)
    : 30000;

  if (isNaN(maxQueryDepth) || maxQueryDepth < 1) {
    throw new Error(`Invalid MAX_QUERY_DEPTH "${env.MAX_QUERY_DEPTH}". Must be a positive number.`);
  }

  if (isNaN(requestTimeoutMs) || requestTimeoutMs < 1000) {
    throw new Error(
      `Invalid REQUEST_TIMEOUT_MS "${env.REQUEST_TIMEOUT_MS}". Must be at least 1000ms.`,
    );
  }

  const config: Config = {
    nodeEnv: nodeEnv as 'development' | 'production' | 'test',
    port,
    logLevel: logLevel as 'error' | 'warn' | 'info' | 'debug',
    logFile: env.LOG_FILE,
    graphqlIntrospection,
    maxQueryDepth,
    requestTimeoutMs,
  };

  return config;
}

/**
 * Helper function to check if running in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Helper function to check if running in production mode
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}
