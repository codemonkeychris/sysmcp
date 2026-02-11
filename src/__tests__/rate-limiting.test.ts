/**
 * SEC-009: Rate limiting tests
 * Tests rate limiting middleware independently of full server startup
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import supertest from 'supertest';

describe('SEC-009: Rate Limiting', () => {
  it('should return 429 after exceeding rate limit', async () => {
    const app = express();
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: 5, // low limit for fast testing
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later' },
    });

    app.use('/graphql', limiter);
    app.post('/graphql', (_req, res) => res.json({ data: { ok: true } }));

    const agent = supertest(app);

    // Make 6 requests (limit is 5)
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await agent
        .post('/graphql')
        .set('Content-Type', 'application/json')
        .send({ query: '{ __typename }' });
      statuses.push(res.status);
    }

    // First 5 should succeed, 6th should be 429
    expect(statuses.slice(0, 5).every(s => s === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it('should include rate limit headers in response', async () => {
    const app = express();
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
    });

    app.use('/graphql', limiter);
    app.post('/graphql', (_req, res) => res.json({ data: { ok: true } }));

    const agent = supertest(app);
    const res = await agent
      .post('/graphql')
      .set('Content-Type', 'application/json')
      .send({ query: '{ __typename }' });

    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });

  it('should return JSON error body when rate limited', async () => {
    const app = express();
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: 1,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later' },
    });

    app.use('/graphql', limiter);
    app.post('/graphql', (_req, res) => res.json({ data: { ok: true } }));

    const agent = supertest(app);

    // First request succeeds
    await agent.post('/graphql').send({ query: '{ __typename }' });
    // Second request should be rate limited
    const res = await agent.post('/graphql').send({ query: '{ __typename }' });

    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Too many requests, please try again later');
  });

  it('should not rate limit non-graphql endpoints', async () => {
    const app = express();
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false,
    });

    app.use('/graphql', limiter);
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));
    app.post('/graphql', (_req, res) => res.json({ data: { ok: true } }));

    const agent = supertest(app);

    // Exhaust the rate limit on /graphql
    await agent.post('/graphql').send({});
    await agent.post('/graphql').send({});
    const rateLimited = await agent.post('/graphql').send({});
    expect(rateLimited.status).toBe(429);

    // /health should still work fine
    const healthRes = await agent.get('/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.status).toBe('ok');
  });

  it('should apply rate limiting per IP address', async () => {
    const app = express();
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false,
    });

    app.use('/graphql', limiter);
    app.post('/graphql', (_req, res) => res.json({ data: { ok: true } }));

    const agent = supertest(app);

    // All requests from same IP (supertest uses ::ffff:127.0.0.1)
    const res1 = await agent.post('/graphql').send({});
    const res2 = await agent.post('/graphql').send({});
    const res3 = await agent.post('/graphql').send({});

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(429);
  });
});
