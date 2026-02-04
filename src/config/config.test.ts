import { createConfig, isDevelopment, isProduction, Config } from '../index';

describe('Configuration Manager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Save original environment
    process.env = { ...originalEnv };
    // Clear NODE_ENV for clean tests
    delete process.env.NODE_ENV;
    delete process.env.PORT;
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_FILE;
    delete process.env.GRAPHQL_INTROSPECTION;
    delete process.env.MAX_QUERY_DEPTH;
    delete process.env.REQUEST_TIMEOUT_MS;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('createConfig()', () => {
    it('should return default config when no env vars set', () => {
      const config = createConfig();

      expect(config).toBeDefined();
      expect(config.nodeEnv).toBe('development');
      expect(config.port).toBe(3000);
      expect(config.logLevel).toBe('info');
      expect(config.graphqlIntrospection).toBe(true);
      expect(config.maxQueryDepth).toBe(10);
      expect(config.requestTimeoutMs).toBe(30000);
    });

    it('should load NODE_ENV from environment', () => {
      process.env.NODE_ENV = 'production';
      const config = createConfig();
      expect(config.nodeEnv).toBe('production');
    });

    it('should reject invalid NODE_ENV', () => {
      process.env.NODE_ENV = 'invalid';
      expect(() => createConfig()).toThrow('Invalid NODE_ENV');
    });

    it('should load PORT from environment', () => {
      process.env.PORT = '8080';
      const config = createConfig();
      expect(config.port).toBe(8080);
    });

    it('should validate PORT is valid number', () => {
      process.env.PORT = 'invalid';
      expect(() => createConfig()).toThrow('Invalid PORT');
    });

    it('should reject PORT outside valid range', () => {
      process.env.PORT = '70000';
      expect(() => createConfig()).toThrow('Invalid PORT');
    });

    it('should reject PORT 0', () => {
      process.env.PORT = '0';
      expect(() => createConfig()).toThrow('Invalid PORT');
    });

    it('should load LOG_LEVEL from environment', () => {
      process.env.LOG_LEVEL = 'debug';
      const config = createConfig();
      expect(config.logLevel).toBe('debug');
    });

    it('should reject invalid LOG_LEVEL', () => {
      process.env.LOG_LEVEL = 'invalid';
      expect(() => createConfig()).toThrow('Invalid LOG_LEVEL');
    });

    it('should load LOG_FILE from environment', () => {
      process.env.LOG_FILE = '/var/log/app.log';
      const config = createConfig();
      expect(config.logFile).toBe('/var/log/app.log');
    });

    it('should respect GRAPHQL_INTROSPECTION setting', () => {
      process.env.GRAPHQL_INTROSPECTION = 'false';
      const config = createConfig();
      expect(config.graphqlIntrospection).toBe(false);
    });

    it('should default GRAPHQL_INTROSPECTION to true', () => {
      const config = createConfig();
      expect(config.graphqlIntrospection).toBe(true);
    });

    it('should load MAX_QUERY_DEPTH from environment', () => {
      process.env.MAX_QUERY_DEPTH = '20';
      const config = createConfig();
      expect(config.maxQueryDepth).toBe(20);
    });

    it('should reject invalid MAX_QUERY_DEPTH', () => {
      process.env.MAX_QUERY_DEPTH = 'invalid';
      expect(() => createConfig()).toThrow('Invalid MAX_QUERY_DEPTH');
    });

    it('should reject MAX_QUERY_DEPTH less than 1', () => {
      process.env.MAX_QUERY_DEPTH = '0';
      expect(() => createConfig()).toThrow('Invalid MAX_QUERY_DEPTH');
    });

    it('should load REQUEST_TIMEOUT_MS from environment', () => {
      process.env.REQUEST_TIMEOUT_MS = '60000';
      const config = createConfig();
      expect(config.requestTimeoutMs).toBe(60000);
    });

    it('should reject invalid REQUEST_TIMEOUT_MS', () => {
      process.env.REQUEST_TIMEOUT_MS = 'invalid';
      expect(() => createConfig()).toThrow('Invalid REQUEST_TIMEOUT_MS');
    });

    it('should reject REQUEST_TIMEOUT_MS less than 1000', () => {
      process.env.REQUEST_TIMEOUT_MS = '500';
      expect(() => createConfig()).toThrow('Invalid REQUEST_TIMEOUT_MS');
    });

    it('should load all configuration values correctly', () => {
      process.env.NODE_ENV = 'production';
      process.env.PORT = '5000';
      process.env.LOG_LEVEL = 'warn';
      process.env.LOG_FILE = '/logs/app.log';
      process.env.GRAPHQL_INTROSPECTION = 'false';
      process.env.MAX_QUERY_DEPTH = '15';
      process.env.REQUEST_TIMEOUT_MS = '45000';

      const config = createConfig();

      expect(config.nodeEnv).toBe('production');
      expect(config.port).toBe(5000);
      expect(config.logLevel).toBe('warn');
      expect(config.logFile).toBe('/logs/app.log');
      expect(config.graphqlIntrospection).toBe(false);
      expect(config.maxQueryDepth).toBe(15);
      expect(config.requestTimeoutMs).toBe(45000);
    });

    it('should return Config type', () => {
      const config = createConfig();
      expect(config).toHaveProperty('nodeEnv');
      expect(config).toHaveProperty('port');
      expect(config).toHaveProperty('logLevel');
      expect(config).toHaveProperty('graphqlIntrospection');
      expect(config).toHaveProperty('maxQueryDepth');
      expect(config).toHaveProperty('requestTimeoutMs');
    });
  });

  describe('isDevelopment()', () => {
    it('should return true when NODE_ENV is not production', () => {
      process.env.NODE_ENV = 'development';
      expect(isDevelopment()).toBe(true);
    });

    it('should return true when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      expect(isDevelopment()).toBe(true);
    });

    it('should return false when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      expect(isDevelopment()).toBe(false);
    });
  });

  describe('isProduction()', () => {
    it('should return true when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      expect(isProduction()).toBe(true);
    });

    it('should return false when NODE_ENV is development', () => {
      process.env.NODE_ENV = 'development';
      expect(isProduction()).toBe(false);
    });

    it('should return false when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      expect(isProduction()).toBe(false);
    });
  });
});
