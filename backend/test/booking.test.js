const { API_KEY, createSlot, bookingPayload, newIdempotencyKey } = require('./helpers/setup');
const request = require('supertest');
const app = require('../app');
const db = require('./database');
const Slot = require('../app/models/SlotModel');
const Booking = require('../app/models/BookingModel');

const api = () => request(app);

const book = (payload, key = newIdempotencyKey()) => api()
  .post('/v1/bookings')
  .set('x-api-key', API_KEY)
  .set('Idempotency-Key', key)
  .send(payload);

beforeAll(async () => await db.connect());
beforeEach(async () => await db.clear());
afterAll(async () => await db.close());


describe('Level 1 - list slots, book one, look up a booking', () => {
  test('GET /v1/slots lists only upcoming available slots, earliest first', async () => {
    const later = await createSlot({ startTime: new Date(Date.now() + 48 * 3600e3) });
    const sooner = await createSlot({ startTime: new Date(Date.now() + 24 * 3600e3) });
    await createSlot({ startTime: new Date(Date.now() - 3600e3) }); // past
    await createSlot({ startTime: new Date(Date.now() + 72 * 3600e3), status: 'Booked' });

    const res = await api().get('/v1/slots').set('x-api-key', API_KEY).expect(200);

    expect(res.body.total).toBe(2);
    expect(res.body.data.map(s => s.id)).toEqual([sooner.id, later.id]);
    expect(res.body.data[0]).toEqual(expect.objectContaining({
      practitioner: 'Dr. Test', status: 'Available'
    }));
    expect(res.body.data[0]).not.toHaveProperty('booking');
  });

  test('GET /v1/slots?date= filters by day and validates the format', async () => {
    await api().get('/v1/slots?date=11-11-2026').set('x-api-key', API_KEY).expect(422);
    const res = await api().get('/v1/slots?date=2099-01-01').set('x-api-key', API_KEY).expect(200);
    expect(res.body.data).toEqual([]);
  });

  test('POST /v1/bookings books a slot and returns a confirmation', async () => {
    const slot = await createSlot();

    const res = await book(bookingPayload(slot._id)).expect(201);
    const { booking } = res.body.data;

    expect(booking.reference).toMatch(/^BK-[A-Z0-9]{8}$/);
    expect(booking).toEqual(expect.objectContaining({
      slotId: slot.id,
      patientName: 'Ada Lovelace',
      patientEmail: 'ada@example.com',
      status: 'Confirmed',
      practitioner: 'Dr. Test',
    }));

    const updatedSlot = await Slot.findById(slot._id);
    expect(updatedSlot.status).toBe('Booked');

    const list = await api().get('/v1/slots').set('x-api-key', API_KEY).expect(200);
    expect(list.body.total).toBe(0);
  });

  test('GET /v1/bookings/:reference returns the booking, 404 when unknown', async () => {
    const slot = await createSlot();
    const created = await book(bookingPayload(slot._id)).expect(201);
    const { reference } = created.body.data.booking;

    const res = await api().get(`/v1/bookings/${reference}`).set('x-api-key', API_KEY).expect(200);
    expect(res.body.data.booking.reference).toBe(reference);

    await api().get('/v1/bookings/BK-ZZZZZZZZ').set('x-api-key', API_KEY).expect(404);
    await api().get('/v1/bookings/not-a-ref').set('x-api-key', API_KEY).expect(404);
  });

  test('booking an unknown slot returns 404', async () => {
    await book(bookingPayload('aaaaaaaaaaaaaaaaaaaaaaaa')).expect(404);
  });

  test('booking a slot that does not exist returns 404', async () => {
    await book(bookingPayload('64a123456789012345678901')).expect(404);
  });

  test('booking a past slot returns 400', async () => {
    const slot = await createSlot({ startTime: new Date(Date.now() - 3600e3) });
    await book(bookingPayload(slot._id)).expect(400);
  });
});


describe('Level 2 - API key and validation', () => {
  test.each([
    ['get', '/v1/slots'],
    ['get', '/v1/bookings?email=a@b.com'],
    ['get', '/v1/bookings/BK-ABCDEFGH'],
    ['post', '/v1/bookings'],
    ['patch', '/v1/bookings/BK-ABCDEFGH/cancel'],
  ])('%s %s without an API key is rejected with 401', async (method, url) => {
    const res = await api()[method](url).expect(401);
    expect(res.body.error).toMatch(/API key/i);
  });

  test('an invalid API key is rejected with 401', async () => {
    await api().get('/v1/slots').set('x-api-key', 'wrong-key').expect(401);
  });

  test('any configured API key is accepted', async () => {
    await api().get('/v1/slots').set('x-api-key', 'second-test-key').expect(200);
  });

  test('public endpoints do not need a key', async () => {
    await api().get('/').expect(200);
    await api().get('/health').expect(200);
  });

  test.each([
    ['missing slotId', { slotId: undefined }],
    ['empty slotId', { slotId: '   ' }],
    ['missing name', { patientName: undefined }],
    ['blank name', { patientName: '   ' }],
    ['missing email', { patientEmail: undefined }],
    ['invalid email', { patientEmail: 'not-an-email' }],
    ['invalid phone', { patientPhone: 'call me maybe' }],
    ['overlong reason', { reason: 'x'.repeat(501) }],
    ['email as object (injection attempt)', { patientEmail: { $ne: null } }],
  ])('rejects a booking with %s (400) and leaves the slot available', async (_, overrides) => {
    const slot = await createSlot();
    const payload = bookingPayload(slot._id, overrides);

    const res = await book(payload).expect(400);
    expect(typeof res.body.error).toBe('string');

    expect((await Slot.findById(slot._id)).status).toBe('Available');
    expect(await Booking.countDocuments()).toBe(0);
  });

  test('malformed JSON returns 400', async () => {
    await api().post('/v1/bookings')
      .set('x-api-key', API_KEY)
      .set('Idempotency-Key', newIdempotencyKey())
      .set('Content-Type', 'application/json')
      .send('{"slotId": ')
      .expect(400);
  });
});


describe('Level 3 - no double booking, cancellation', () => {
  test('two people booking the same slot at the same moment: exactly one wins', async () => {
    const slot = await createSlot();

    const attempts = 20;
    const responses = await Promise.all(Array.from({ length: attempts }, (_, i) =>
      book(bookingPayload(slot._id, { patientEmail: `patient${i}@example.com` }))));

    const statuses = responses.map(r => r.status);
    expect(statuses.filter(s => s === 201)).toHaveLength(1);
    expect(statuses.filter(s => s === 409)).toHaveLength(attempts - 1);
    expect(await Booking.countDocuments({ slot: slot._id, status: 'Confirmed' })).toBe(1);
  });

  test('the database rejects a second confirmed booking for a slot even if app logic is bypassed', async () => {
    const slot = await createSlot();
    const base = {
      slot: slot._id, patientName: 'A', patientEmail: 'a@example.com',
      startTime: slot.startTime, endTime: slot.endTime, practitioner: slot.practitioner,
    };
    await Booking.create({ ...base, reference: 'BK-AAAAAAAA' });
    await expect(Booking.create({ ...base, reference: 'BK-BBBBBBBB' })).rejects.toThrow(/duplicate key/);
  });

  test('cancelling a booking frees the slot so it can be booked again', async () => {
    const slot = await createSlot();
    const created = await book(bookingPayload(slot._id)).expect(201);
    const { reference } = created.body.data.booking;

    const res = await api().patch(`/v1/bookings/${reference}/cancel`).set('x-api-key', API_KEY).expect(200);
    expect(res.body.data.booking.status).toBe('Cancelled');
    expect(res.body.data.booking.cancelledAt).toBeTruthy();
    expect((await Slot.findById(slot._id)).status).toBe('Available');

    await book(bookingPayload(slot._id, { patientEmail: 'grace@example.com' })).expect(201);
  });

  test('cancelling twice returns 409; unknown booking returns 404', async () => {
    const slot = await createSlot();
    const { body } = await book(bookingPayload(slot._id)).expect(201);
    const { reference } = body.data.booking;

    await api().patch(`/v1/bookings/${reference}/cancel`).set('x-api-key', API_KEY).expect(200);
    await api().patch(`/v1/bookings/${reference}/cancel`).set('x-api-key', API_KEY).expect(409);
    await api().patch('/v1/bookings/BK-ZZZZZZZZ/cancel').set('x-api-key', API_KEY).expect(404);
  });

  test('concurrent cancels of the same booking: exactly one succeeds', async () => {
    const slot = await createSlot();
    const { body } = await book(bookingPayload(slot._id)).expect(201);
    const { reference } = body.data.booking;

    const responses = await Promise.all(Array.from({ length: 5 }, () =>
      api().patch(`/v1/bookings/${reference}/cancel`).set('x-api-key', API_KEY)));

    expect(responses.filter(r => r.status === 200)).toHaveLength(1);
    expect(responses.filter(r => r.status === 409)).toHaveLength(4);
  });

  test('a patient cannot book two slots at the same time from different practitioners', async () => {
    const startTime = new Date(Date.now() + 24 * 3600e3);
    const slotDrAda = await createSlot({ practitioner: 'Dr. Ada Obi', startTime });
    const slotDrTunde = await createSlot({ practitioner: 'Dr. Tunde Bello', startTime });

    await book(bookingPayload(slotDrAda._id, { patientEmail: 'precious@example.com' })).expect(201);

    const clashRes = await book(
      bookingPayload(slotDrTunde._id, { patientEmail: 'precious@example.com' })
    ).expect(409);

    expect(clashRes.body.error).toMatch(/already have a confirmed appointment/i);
    expect((await Slot.findById(slotDrTunde._id)).status).toBe('Available');
  });
});


describe('Level 4 - idempotent retries and paging', () => {
  test('the Idempotency-Key header is optional', async () => {
    const slot = await createSlot();
    const res = await api().post('/v1/bookings').set('x-api-key', API_KEY)
      .send(bookingPayload(slot._id)).expect(201);
    expect(res.body.data.booking).toBeDefined();
  });

  test('retrying with the same key returns the original booking, never a duplicate', async () => {
    const slot = await createSlot();
    const key = newIdempotencyKey();
    const payload = bookingPayload(slot._id);

    const first = await book(payload, key).expect(201);
    const retry = await book(payload, key).expect(201);

    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body).toEqual(first.body);
    expect(await Booking.countDocuments()).toBe(1);
  });

  test('concurrent retries with the same key create exactly one booking', async () => {
    const slot = await createSlot();
    const key = newIdempotencyKey();
    const payload = bookingPayload(slot._id);

    const responses = await Promise.all(Array.from({ length: 10 }, () => book(payload, key)));

    // Either the original 201, a replay of it, or "still processing" (409) - never a second booking
    responses.forEach(r => expect([201, 409]).toContain(r.status));
    const references = new Set(responses.filter(r => r.status === 201).map(r => r.body.data.booking.reference));
    expect(references.size).toBe(1);
    expect(await Booking.countDocuments()).toBe(1);
  });

  test('reusing a key with a different payload is rejected (422)', async () => {
    const slotA = await createSlot();
    const slotB = await createSlot();
    const key = newIdempotencyKey();

    await book(bookingPayload(slotA._id), key).expect(201);
    await book(bookingPayload(slotB._id), key).expect(422);
    expect((await Slot.findById(slotB._id)).status).toBe('Available');
  });

  test('same key from a different API client is treated independently', async () => {
    const slot = await createSlot();
    const key = newIdempotencyKey();

    await book(bookingPayload(slot._id), key).expect(201);
    const other = await api().post('/v1/bookings')
      .set('x-api-key', 'second-test-key').set('Idempotency-Key', key)
      .send(bookingPayload(slot._id)).expect(409); // its own attempt: the slot is taken
    expect(other.headers['idempotent-replayed']).toBeUndefined();
  });

  test('a patient can page through their bookings', async () => {
    const slots = [];
    for (let i = 0; i < 5; i++) slots.push(await createSlot({ startTime: new Date(Date.now() + (i + 1) * 3600e3) }));
    // 3 active + 2 cancelled (active cap is 3)
    for (const [i, slot] of slots.entries()) {
      const { body } = await book(bookingPayload(slot._id, { patientEmail: 'Pager@Example.com' })).expect(201);
      if (i < 2) await api().patch(`/v1/bookings/${body.data.booking.reference}/cancel`).set('x-api-key', API_KEY).expect(200);
    }
    const other = await createSlot();
    await book(bookingPayload(other._id, { patientEmail: 'someone-else@example.com' })).expect(201);

    const page1 = await api().get('/v1/bookings?email=pager@example.com&limit=2&page=1').set('x-api-key', API_KEY).expect(200);
    const page2 = await api().get('/v1/bookings?email=pager@example.com&limit=2&page=2').set('x-api-key', API_KEY).expect(200);
    const page3 = await api().get('/v1/bookings?email=pager@example.com&limit=2&page=3').set('x-api-key', API_KEY).expect(200);

    expect(page1.body).toEqual(expect.objectContaining({ total: 5, page: 1, pages: 3, limit: 2 }));
    expect(page1.body.data).toHaveLength(2);
    expect(page2.body.data).toHaveLength(2);
    expect(page3.body.data).toHaveLength(1);

    const all = [...page1.body.data, ...page2.body.data, ...page3.body.data];
    expect(new Set(all.map(b => b.reference)).size).toBe(5);
    all.forEach(b => expect(b.patientEmail).toBe('pager@example.com'));
    // newest appointment first
    const times = all.map(b => new Date(b.startTime).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    const cancelled = await api().get('/v1/bookings?email=pager@example.com&status=Cancelled').set('x-api-key', API_KEY).expect(200);
    expect(cancelled.body.total).toBe(2);
  });

  test('listing bookings validates the query', async () => {
    await api().get('/v1/bookings').set('x-api-key', API_KEY).expect(422);
    await api().get('/v1/bookings?email=nope').set('x-api-key', API_KEY).expect(422);
    await api().get('/v1/bookings?email=a@b.com&limit=1000').set('x-api-key', API_KEY).expect(422);
    await api().get('/v1/bookings?email[$ne]=x').set('x-api-key', API_KEY).expect(422);
  });
});


describe('Level 5 - anti-spam: per-patient active booking cap', () => {
  test('a patient cannot hold more than the allowed number of upcoming bookings', async () => {
    const slots = [];
    for (let i = 0; i < 4; i++) slots.push(await createSlot());

    for (let i = 0; i < 3; i++) await book(bookingPayload(slots[i]._id)).expect(201);

    const res = await book(bookingPayload(slots[3]._id, { patientEmail: 'ADA@example.com' })).expect(409);
    expect(res.body.error).toMatch(/maximum of 3/);
    expect((await Slot.findById(slots[3]._id)).status).toBe('Available');
  });
});

describe('Reset slot endpoint - POST /v1/slots/reset', () => {
  test('deletes every booking and replaces all slots with sent ones, including past slots', async () => {
    // 1. Create existing slots and a booking
    const initialSlot = await createSlot();
    const bookingRes = await book(bookingPayload(initialSlot._id)).expect(201);
    const bookingRef = bookingRes.body.data.booking.reference;

    expect(await Booking.countDocuments()).toBe(1);
    expect(await Slot.countDocuments()).toBe(1);

    // 2. Call reset endpoint with past and future slots
    const pastSlot = {
      practitioner: 'Dr. Historical',
      startTime: '2021-01-01T09:00:00.000Z',
      endTime: '2021-01-01T09:30:00.000Z'
    };
    const futureSlot = {
      practitioner: 'Dr. Future',
      startTime: '2035-12-01T10:00:00.000Z',
      endTime: '2035-12-01T10:30:00.000Z'
    };

    const resetRes = await api()
      .post('/v1/slots/reset')
      .set('x-api-key', API_KEY)
      .send([pastSlot, futureSlot])
      .expect(200);

    expect(resetRes.body.data.count).toBe(2);
    expect(resetRes.body.data.slots).toHaveLength(2);

    // 3. Verify all bookings are wiped
    expect(await Booking.countDocuments()).toBe(0);
    await api().get(`/v1/bookings/${bookingRef}`).set('x-api-key', API_KEY).expect(404);

    // 4. Verify past and future slots are in the database
    expect(await Slot.countDocuments()).toBe(2);
    const savedPast = await Slot.findOne({ practitioner: 'Dr. Historical' });
    expect(savedPast).not.toBeNull();
    expect(savedPast.startTime.toISOString()).toBe(pastSlot.startTime);

    // 5. Booking the past slot returns 400 (slot already started)
    await book(bookingPayload(savedPast._id)).expect(400);

    // 6. Booking the future slot succeeds with 201
    const savedFuture = await Slot.findOne({ practitioner: 'Dr. Future' });
    await book(bookingPayload(savedFuture._id)).expect(201);
    expect(await Booking.countDocuments()).toBe(1);
  });
});

describe('API Key Management - /v1/api-keys', () => {
  test('generates a new API key, authenticates requests with it, lists keys, and revokes it', async () => {
    // 1. Generate a new API key for an external application
    const genRes = await api()
      .post('/v1/api-keys')
      .send({ name: 'External Partner App', description: 'Mobile client' })
      .expect(201);

    const { apiKey, details } = genRes.body.data;
    expect(apiKey).toMatch(/^koya_live_[0-9a-f]{48}$/);
    expect(details.name).toBe('External Partner App');
    expect(details.status).toBe('Active');
    expect(details).not.toHaveProperty('keyHash');

    // 2. Use the newly generated API key to access protected endpoints
    const slot = await createSlot();
    await api()
      .get('/v1/slots')
      .set('x-api-key', apiKey)
      .expect(200);

    await api()
      .post('/v1/bookings')
      .set('x-api-key', apiKey)
      .send(bookingPayload(slot._id))
      .expect(201);

    // 3. List registered API keys
    const listRes = await api()
      .get('/v1/api-keys')
      .set('x-api-key', apiKey)
      .expect(200);
    expect(listRes.body.total).toBe(1);
    expect(listRes.body.data[0].id).toBe(details.id);

    // 4. Revoke the API key and verify it can no longer access the API
    await api()
      .patch(`/v1/api-keys/${details.id}/revoke`)
      .set('x-api-key', API_KEY)
      .expect(200);

    await api()
      .get('/v1/slots')
      .set('x-api-key', apiKey)
      .expect(401);
  });
});

