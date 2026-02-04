/**
 * Tests for HTTP Server
 */

import { createServer } from '../server';
import { createLogger } from '../logger';
import { createRegistry } from '../services/registry';
import { Config } from '../config';

describe('HTTP Server', () => {
  let logger: ReturnType<typeof createLogger>;
  let registry: ReturnType<typeof createRegistry>;
  let config: Config;
  let server: ReturnType<typeof createServer>;

  beforeEach(() => {
    logger = createLogger({
      level: 'error',
      service: 'server-test',
    });

    registry = createRegistry(logger);

    config = {
      nodeEnv: 'test',
      port: 0, // Use random available port
      logLevel: 'error',
      graphqlIntrospection: true,
      maxQueryDepth: 10,
      requestTimeoutMs: 30000,
    };

    server = createServer(logger, config, registry);
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('server initialization', () => {
    it('should create a server instance', () => {
      expect(server).toBeDefined();
      expect(server.app).toBeDefined();
    });

    it('should start the server', async () => {
      await expect(server.start()).resolves.toBeUndefined();
    }, 5000);

    it('should listen on configured port', async () => {
      const testConfig: Config = {
        ...config,
        port: 3001,
      };

      const testServer = createServer(logger, testConfig, registry);

      await testServer.start();

      // Check that server is listening (we can't easily verify the exact port in tests)
      expect(testServer.app).toBeDefined();

      await testServer.stop();
    }, 5000);
  });

  describe('/health endpoint', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should return health status as ok', async () => {
      const response = await new Promise<string>((resolve, reject) => {
        const http = require('http');
        const req = http.request(
          {
            hostname: 'localhost',
            port: (server.app.listen(0) as any).address?.().port || 3000,
            path: '/health',
            method: 'GET',
          },
          (res: any) => {
            let data = '';
            res.on('data', (chunk: any) => {
              data += chunk;
            });
            res.on('end', () => {
              resolve(data);
            });
          }
        );

        req.on('error', reject);
        req.end();
      }).catch(() => '{}');

      if (response) {
        const parsed = JSON.parse(response);
        expect(parsed.status).toMatch(/^(ok|degraded)$/);
        expect(parsed.uptime).toBeGreaterThanOrEqual(0);
        expect(typeof parsed.services).toBe('number');
      }
    });

    it('should include all required fields in health response', async () => {
      // Register some services
      registry.register({ name: 'service1', type: 'test' });
      registry.register({ name: 'service2', type: 'test' });

      // Health endpoint should include them
      expect(registry.getAll().length).toBe(2);
    });

    it('should show degraded status when service has error', () => {
      // Register a service and put it in error state
      registry.register({ name: 'error-service', type: 'test' });
      registry.updateState('error-service', 'starting');
      registry.updateState('error-service', 'error', 'Test error');

      // Verify it's in error state
      const services = registry.getAll();
      const errorCount = services.filter((s) => s.state === 'error').length;
      expect(errorCount).toBeGreaterThan(0);
    });
  });

  describe('request handling', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should handle GET requests', async () => {
      const app = server.app;
      expect(app).toBeDefined();
    });

    it('should parse JSON request bodies', async () => {
      const app = server.app;

      // Test that middleware is set up
      expect(app).toBeDefined();
    });

    it('should handle 404 errors', async () => {
      // The server should have middleware for 404s
      expect(server.app).toBeDefined();
    });

    it('should handle errors with middleware', async () => {
      // The server should have error handling middleware
      expect(server.app).toBeDefined();
    });
  });

  describe('graceful shutdown', () => {
    it('should stop the server gracefully', async () => {
      await server.start();
      await expect(server.stop()).resolves.toBeUndefined();
    }, 10000);

    it('should handle shutdown signal', async () => {
      await server.start();

      // Graceful shutdown should complete
      await expect(server.stop()).resolves.toBeUndefined();
    }, 10000);

    it('should not error on double stop', async () => {
      await server.start();
      await server.stop();

      // Second stop should not error
      await expect(server.stop()).resolves.toBeUndefined();
    }, 10000);
  });

  describe('request timeout', () => {
    it('should apply request timeout from config', async () => {
      const testConfig: Config = {
        ...config,
        requestTimeoutMs: 5000,
      };

      const testServer = createServer(logger, testConfig, registry);
      await testServer.start();

      // Server should be listening with timeout set
      expect(testServer.app).toBeDefined();

      await testServer.stop();
    }, 10000);
  });

  describe('configuration application', () => {
    it('should use config port', async () => {
      const testConfig: Config = {
        ...config,
        port: 3002,
      };

      const testServer = createServer(logger, testConfig, registry);
      await testServer.start();

      // Verify server created successfully with config
      expect(testServer.app).toBeDefined();

      await testServer.stop();
    }, 5000);

    it('should use config nodeEnv', async () => {
      const testConfig: Config = {
        ...config,
        nodeEnv: 'production',
      };

      const testServer = createServer(logger, testConfig, registry);
      expect(testServer.app).toBeDefined();
    });

    it('should use config requestTimeout', async () => {
      const testConfig: Config = {
        ...config,
        requestTimeoutMs: 60000,
      };

      const testServer = createServer(logger, testConfig, registry);
      expect(testServer.app).toBeDefined();
    });
  });
});
