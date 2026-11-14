require('./helpers/setup');
const db = require('./database');
const Slot = require('../app/models/SlotModel');
const slotService = require('../app/services/SlotService');

beforeAll(async () => await db.connect());
beforeEach(async () => await db.clear());
afterAll(async () => await db.close());

describe('SlotService.generateSlots', () => {
  // Monday 2030-01-07 00:00 in Lagos (UTC+1)
  const monday = new Date('2030-01-06T23:00:00Z');

  test('creates 30 minute weekday slots between 09:00 and 17:00 clinic time for each practitioner', () => {
    const slots = slotService.generateSlots({days: 7, from: monday, practitioners: ['Dr. A', 'Dr. B'], tz: 'Africa/Lagos'});

    // 5 weekdays * 16 slots/day * 2 practitioners
    expect(slots).toHaveLength(160);
    expect(slots[0].startTime.toISOString()).toBe('2030-01-07T08:00:00.000Z'); // 09:00 Lagos
    expect(slots[slots.length - 1].endTime.toISOString()).toBe('2030-01-11T16:00:00.000Z'); // 17:00 Lagos Friday
    slots.forEach(s => expect(s.endTime - s.startTime).toBe(30 * 60 * 1000));
  });
});

describe('SlotService.seedSlots', () => {
  test('is idempotent and never resets booked slots', async () => {
    const options = {days: 3, from: new Date('2030-01-07T00:00:00Z'), practitioners: ['Dr. A'], tz: 'Africa/Lagos'};

    const first = await slotService.seedSlots(options);
    expect(first.inserted).toBe(first.generated);

    await Slot.updateOne({}, {status: 'Booked'});
    const second = await slotService.seedSlots(options);

    expect(second.inserted).toBe(0);
    expect(await Slot.countDocuments()).toBe(first.generated);
    expect(await Slot.countDocuments({status: 'Booked'})).toBe(1);
  });
});

describe('SlotService.resetSlots', () => {
  const Booking = require('../app/models/BookingModel');

  test('deletes every booking and replaces all slots with sent ones, including past slots', async () => {
    // Seed existing slots and a booking
    const slot = await Slot.create({
      practitioner: 'Dr. Old',
      startTime: new Date('2030-01-01T10:00:00Z'),
      endTime: new Date('2030-01-01T10:30:00Z'),
      status: 'Booked'
    });
    await Booking.create({
      reference: 'BK-TEST1234',
      slot: slot._id,
      patientName: 'Test Patient',
      patientEmail: 'test@example.com',
      startTime: slot.startTime,
      endTime: slot.endTime,
      practitioner: slot.practitioner,
      status: 'Confirmed'
    });

    expect(await Booking.countDocuments()).toBe(1);
    expect(await Slot.countDocuments()).toBe(1);

    // Reset with past slots
    const pastStart = new Date('2020-05-01T09:00:00Z');
    const pastEnd = new Date('2020-05-01T09:30:00Z');
    const futureStart = new Date('2035-06-01T14:00:00Z');
    const futureEnd = new Date('2035-06-01T14:30:00Z');

    const result = await slotService.resetSlots([
      { practitioner: 'Dr. Past', startTime: pastStart.toISOString(), endTime: pastEnd.toISOString() },
      { practitioner: 'Dr. Future', startTime: futureStart.toISOString(), endTime: futureEnd.toISOString() }
    ]);

    expect(result.statusCode).toBe(200);
    expect(result.data.count).toBe(2);

    // Every previous booking deleted
    expect(await Booking.countDocuments()).toBe(0);

    // Old slot replaced by the two new slots
    expect(await Slot.countDocuments()).toBe(2);
    expect(await Slot.findOne({ practitioner: 'Dr. Old' })).toBeNull();

    const pastSlot = await Slot.findOne({ practitioner: 'Dr. Past' });
    expect(pastSlot).not.toBeNull();
    expect(pastSlot.startTime.toISOString()).toBe(pastStart.toISOString());
    expect(pastSlot.status).toBe('Available');

    const futureSlot = await Slot.findOne({ practitioner: 'Dr. Future' });
    expect(futureSlot).not.toBeNull();
    expect(futureSlot.startTime.toISOString()).toBe(futureStart.toISOString());
  });

  test('supports object with { slots: [...] } and resets to empty if empty array sent', async () => {
    await Slot.create({
      practitioner: 'Dr. Temporary',
      startTime: new Date('2030-01-01T10:00:00Z'),
      endTime: new Date('2030-01-01T10:30:00Z')
    });

    const result = await slotService.resetSlots({ slots: [] });
    expect(result.statusCode).toBe(200);
    expect(result.data.count).toBe(0);
    expect(await Slot.countDocuments()).toBe(0);
  });
});

