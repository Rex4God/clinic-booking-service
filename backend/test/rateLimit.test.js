// Tight limits for this file only (each jest test file gets a fresh module registry)
process.env.BOOKING_RATE_LIMIT_MAX = "3";
process.env.PATIENT_RATE_LIMIT_MAX = "2";

const {API_KEY, createSlot, bookingPayload, newIdempotencyKey} = require('./helpers/setup');
const request = require('supertest');
const app = require('../app');
const db = require('./database');

const book = (payload, ip = '10.0.0.1') => request(app)
  .post('/v1/bookings')
  .set('x-api-key', API_KEY)
  .set('Idempotency-Key', newIdempotencyKey())
  .set('X-Forwarded-For', ip)
  .send(payload);

beforeAll(async () => await db.connect());
beforeEach(async () => await db.clear());
afterAll(async () => await db.close());

describe('Level 5 - rate limiting booking attempts', () => {
  test('the same patient is throttled even when rotating IPs', async () => {
    const slot = await createSlot();
    const payload = bookingPayload(slot._id, {patientEmail: 'spammer@example.com'});

    await book(payload, '1.1.1.1').expect(201);
    await book(payload, '2.2.2.2').expect(409); // slot taken, but counts as an attempt
    const res = await book(payload, '3.3.3.3').expect(429);
    expect(res.body.error).toMatch(/patient/i);
    expect(res.headers['ratelimit-limit']).toBe('2');
    expect(res.headers['retry-after']).toMatch(/^\d+$/);
  });

  test('a single client is throttled across different patients', async () => {
    const ip = '9.9.9.9';
    const responses = [];
    for (let i = 0; i < 4; i++) {
      const slot = await createSlot();
      responses.push(await book(bookingPayload(slot._id, {patientEmail: `p${i}@example.com`}), ip));
    }

    expect(responses.slice(0, 3).map(r => r.status)).toEqual([201, 201, 201]);
    expect(responses[3].status).toBe(429);
    expect(responses[3].headers['retry-after']).toBeDefined();
  });
});

