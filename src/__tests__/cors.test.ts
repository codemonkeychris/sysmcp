/**
 * SEC-017: CORS configuration tests
 * Tests CORS middleware restricts origins to localhost only
 */

import express from 'express';
import cors from 'cors';
import supertest from 'supertest';

function createTestApp() {
  const app = express();

  // Same CORS config as server.ts (SEC-017)
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      const allowedPatterns = [
        /^https?:\/\/localhost(:\d+)?$/,
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
        /^https?:\/\/\[::1\](:\d+)?$/,
      ];
      if (allowedPatterns.some(pattern => pattern.test(origin))) {
        return callback(null, true);
      }
      callback(new Error('CORS: Origin not allowed'));
    },
    credentials: true,
  }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.post('/graphql', (_req, res) => res.json({ data: { ok: true } }));

  // Error handler for CORS errors
  app.use((err: any, _req: any, res: any, _next: any) => {
    if (err.message?.includes('CORS')) {
      res.status(403).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Internal error' });
    }
  });

  return app;
}

describe('SEC-017: CORS Configuration', () => {
  it('should allow requests from http://localhost', async () => {
    const app = createTestApp();
    const res = await supertest(app)
      .get('/health')
      .set('Origin', 'http://localhost');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost');
  });

  it('should allow requests from http://localhost:3000', async () => {
    const app = createTestApp();
    const res = await supertest(app)
      .get('/health')
      .set('Origin', 'http://localhost:3000');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('should allow requests from http://127.0.0.1', async () => {
    const app = createTestApp();
    const res = await supertest(app)
      .get('/health')
      .set('Origin', 'http://127.0.0.1');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1');
  });

  it('should allow requests from http://127.0.0.1:8080', async () => {
    const app = createTestApp();
    const res = await supertest(app)
      .get('/health')
      .set('Origin', 'http://127.0.0.1:8080');

    expect(res.status).toBe(200);
  });

  it('should allow requests with no Origin header (non-browser)', async () => {
    const app = createTestApp();
    const res = await supertest(app).get('/health');

    expect(res.status).toBe(200);
  });

  it('should reject requests from external origins', async () => {
    const app = createTestApp();
    const res = await supertest(app)
      .get('/health')
      .set('Origin', 'http://evil.example.com');

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('CORS');
  });

  it('should reject requests from non-localhost domains', async () => {
    const app = createTestApp();
    const res = await supertest(app)
      .get('/health')
      .set('Origin', 'http://192.168.1.100:3000');

    expect(res.status).toBe(403);
  });

  it('should reject requests with spoofed localhost subdomain', async () => {
    const app = createTestApp();
    const res = await supertest(app)
      .get('/health')
      .set('Origin', 'http://evil.localhost.example.com');

    expect(res.status).toBe(403);
  });

  it('should include credentials support in CORS headers', async () => {
    const app = createTestApp();
    const res = await supertest(app)
      .options('/graphql')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});
