"use client";

import React, { useState, useEffect, useCallback } from "react";

interface Slot {
  id: string;
  practitioner: string;
  startTime: string;
  endTime: string;
  status: "Available" | "Booked";
}

interface Booking {
  id: string;
  reference: string;
  slotId: string;
  patientName: string;
  patientEmail: string;
  patientPhone?: string;
  reason?: string;
  practitioner: string;
  startTime: string;
  endTime: string;
  status: "Confirmed" | "Cancelled";
  cancelledAt?: string | null;
  createdAt?: number;
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeRange(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const opts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
  };
  return `${start.toLocaleTimeString("en-US", opts)} – ${end.toLocaleTimeString(
    "en-US",
    opts
  )}`;
}

function makeIdempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export default function BookingPortal() {
  // Slots State
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState<boolean>(true);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedPractitioner, setSelectedPractitioner] = useState<string>("");
  const [slotPage, setSlotPage] = useState<number>(1);
  const [slotTotalPages, setSlotTotalPages] = useState<number>(1);
  const [slotTotalCount, setSlotTotalCount] = useState<number>(0);

  // Selected Slot & Booking Form State
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [patientName, setPatientName] = useState<string>("");
  const [patientEmail, setPatientEmail] = useState<string>("");
  const [patientPhone, setPatientPhone] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const [submittingBooking, setSubmittingBooking] = useState<boolean>(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Confirmation State
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(
    null
  );
  const [copiedRef, setCopiedRef] = useState<boolean>(false);

  // Lookup / My Bookings State
  const [lookupTab, setLookupTab] = useState<"reference" | "email">(
    "reference"
  );
  const [lookupRef, setLookupRef] = useState<string>("");
  const [lookupEmail, setLookupEmail] = useState<string>("");
  const [lookupLoading, setLookupLoading] = useState<boolean>(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookedUpBooking, setLookedUpBooking] = useState<Booking | null>(null);
  const [patientBookings, setPatientBookings] = useState<Booking[]>([]);
  const [patientPage, setPatientPage] = useState<number>(1);
  const [patientTotalPages, setPatientTotalPages] = useState<number>(1);
  const [patientTotal, setPatientTotal] = useState<number>(0);

  // Fetch Available Slots
  const fetchSlots = useCallback(
    async (pageToFetch = slotPage) => {
      setSlotsLoading(true);
      setSlotsError(null);

      try {
        const params = new URLSearchParams();
        params.set("page", String(pageToFetch));
        params.set("limit", "12");
        if (selectedDate) params.set("date", selectedDate);
        if (selectedPractitioner)
          params.set("practitioner", selectedPractitioner);

        const res = await fetch(
          `${API_URL}/v1/slots?${params.toString()}`,
          {
            headers: {
              "x-api-key": API_KEY,
            },
          }
        );

        const body = await res.json();
        if (!res.ok) {
          throw new Error(body.error || "Failed to load available slots");
        }

        const list: Slot[] = body.data || [];
        setSlots(list);
        setSlotPage(body.page || 1);
        setSlotTotalPages(body.pages || 1);
        setSlotTotalCount(body.total ?? list.length);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Unable to connect to server";
        setSlotsError(message);
        setSlots([]);
      } finally {
        setSlotsLoading(false);
      }
    },
    [selectedDate, selectedPractitioner, slotPage]
  );

  useEffect(() => {
    fetchSlots(1);
  }, [selectedDate, selectedPractitioner]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setIdempotencyKey(makeIdempotencyKey());
  }, [selectedSlot?.id, patientName, patientEmail, patientPhone, reason]);

  // Select a slot to book
  const handleSelectSlot = (slot: Slot) => {
    setSelectedSlot(slot);
    setConfirmedBooking(null);
    setBookingError(null);
  };

  // Submit booking
  const handleBookSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) {
      setBookingError("Please select an available appointment slot first.");
      return;
    }

    setSubmittingBooking(true);
    setBookingError(null);

    try {
      const payload: Record<string, string> = {
        slotId: selectedSlot.id,
        patientName,
        patientEmail,
      };
      if (patientPhone.trim()) payload.patientPhone = patientPhone.trim();
      if (reason.trim()) payload.reason = reason.trim();

      const activeIdempotencyKey = idempotencyKey || makeIdempotencyKey();
      if (!idempotencyKey) setIdempotencyKey(activeIdempotencyKey);

      const res = await fetch(`${API_URL}/v1/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "Idempotency-Key": activeIdempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          const retryAfter = res.headers.get("Retry-After");
          throw new Error(
            `${body.error || "Too many requests"}${retryAfter ? ` (Retry after ${retryAfter}s)` : ""
            }`
          );
        }
        throw new Error(body.error || "Failed to create booking");
      }

      const booking: Booking = body.data.booking;
      setConfirmedBooking(booking);
      setSelectedSlot(null);
      setReason("");
      setIdempotencyKey(makeIdempotencyKey());
      fetchSlots(slotPage);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Could not complete booking";
      setBookingError(message);
    } finally {
      setSubmittingBooking(false);
    }
  };

  // Cancel a booking by reference
  const handleCancelBooking = async (reference: string) => {
    try {
      const res = await fetch(
        `${API_URL}/v1/bookings/${encodeURIComponent(
          reference
        )}/cancel`,
        {
          method: "PATCH",
          headers: {
            "x-api-key": API_KEY,
          },
        }
      );
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Could not cancel booking");
      }

      const updated: Booking = body.data.booking;
      if (confirmedBooking && confirmedBooking.reference === reference) {
        setConfirmedBooking(updated);
      }
      if (lookedUpBooking && lookedUpBooking.reference === reference) {
        setLookedUpBooking(updated);
      }
      setPatientBookings((prev) =>
        prev.map((b) => (b.reference === reference ? updated : b))
      );
      fetchSlots(slotPage);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to cancel booking");
    }
  };

  // Lookup booking by reference
  const handleLookupByReference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupRef.trim()) return;

    setLookupLoading(true);
    setLookupError(null);
    setLookedUpBooking(null);

    try {
      const res = await fetch(
        `${API_URL}/v1/bookings/${encodeURIComponent(
          lookupRef.trim().toUpperCase()
        )}`,
        {
          headers: {
            "x-api-key": API_KEY,
          },
        }
      );
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Booking not found");
      }
      setLookedUpBooking(body.data.booking);
    } catch (err: unknown) {
      setLookupError(
        err instanceof Error ? err.message : "Could not find booking"
      );
    } finally {
      setLookupLoading(false);
    }
  };

  // Lookup paginated patient bookings by email
  const fetchBookingsByEmail = async (page = 1) => {
    if (!lookupEmail.trim()) return;

    setLookupLoading(true);
    setLookupError(null);

    try {
      const params = new URLSearchParams({
        email: lookupEmail.trim(),
        page: String(page),
        limit: "5",
      });
      const res = await fetch(
        `${API_URL}/v1/bookings?${params.toString()}`,
        {
          headers: {
            "x-api-key": API_KEY,
          },
        }
      );
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Failed to fetch patient bookings");
      }
      setPatientBookings(body.data || []);
      setPatientPage(body.page || 1);
      setPatientTotalPages(body.pages || 1);
      setPatientTotal(body.total || 0);
    } catch (err: unknown) {
      setLookupError(
        err instanceof Error ? err.message : "Could not load bookings"
      );
      setPatientBookings([]);
    } finally {
      setLookupLoading(false);
    }
  };

  const copyReference = (ref: string) => {
    navigator.clipboard.writeText(ref);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Navigation Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              K
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                Rex Health Clinic
              </h1>
              <p className="text-xs text-slate-500">
                Patient Appointment Booking Portal
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        {/* Top Grid: Available Slots (Left 7 cols) + Booking / Confirmation (Right 5 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN: Available Slots */}
          <section className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  1. Available Appointment Slots
                </h2>
                <p className="text-sm text-slate-500">
                  Select an open 60-minute time slot with a practitioner.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fetchSlots(slotPage)}
                className="text-xs font-semibold text-teal-700 hover:text-teal-800 px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 transition"
              >
                Refresh Slots
              </button>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Filter by Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setSlotPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Practitioner
                </label>
                <select
                  value={selectedPractitioner}
                  onChange={(e) => {
                    setSelectedPractitioner(e.target.value);
                    setSlotPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-teal-600 focus:outline-none"
                >
                  <option value="">All Practitioners</option>
                  <option value="Dr. Ada Obi">Dr. Ada Obi</option>
                  <option value="Dr. Tunde Bello">Dr. Tunde Bello</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate("");
                    setSelectedPractitioner("");
                    setSlotPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white hover:bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 transition"
                >
                  Clear Filters
                </button>
              </div>
            </div>

            {/* Slots List */}
            {slotsLoading ? (
              <div className="py-16 text-center text-sm text-slate-500">
                Loading available appointment slots...
              </div>
            ) : slotsError ? (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
                <p className="font-semibold">Could not load slots</p>
                <p className="mt-1 text-xs">{slotsError}</p>
              </div>
            ) : slots.length === 0 ? (
              <div className="py-12 text-center rounded-xl border border-dashed border-slate-200 px-4">
                <p className="text-sm font-medium text-slate-700">
                  No available slots match your filter.
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Note: The clinic is open Monday–Friday (09:00–17:00). Try
                  clearing the date filter or choosing a weekday.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {slots.map((slot) => {
                    const isSelected = selectedSlot?.id === slot.id;
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => handleSelectSlot(slot)}
                        className={`text-left rounded-xl p-3.5 border transition all ${isSelected
                          ? "border-teal-600 bg-teal-50/70 ring-2 ring-teal-600/20"
                          : "border-slate-200 hover:border-teal-500 hover:bg-slate-50"
                          }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                            {slot.practitioner}
                          </span>
                          <span
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${isSelected
                              ? "bg-teal-600 text-white"
                              : "bg-emerald-50 text-emerald-700"
                              }`}
                          >
                            {isSelected ? "Selected" : "Available"}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-slate-900 mt-1.5">
                          {formatTimeRange(slot.startTime, slot.endTime)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatDate(slot.startTime)}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Pagination Bar */}
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <span>
                    Showing page <strong>{slotPage}</strong> of{" "}
                    <strong>{slotTotalPages}</strong> ({slotTotalCount} total
                    available)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={slotPage <= 1}
                      onClick={() => fetchSlots(slotPage - 1)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-medium"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={slotPage >= slotTotalPages}
                      onClick={() => fetchSlots(slotPage + 1)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-medium"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* RIGHT COLUMN: Book Slot Form OR Booking Confirmation */}
          <section className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
            {confirmedBooking ? (
              /* BOOKING CONFIRMATION VIEW */
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${confirmedBooking.status === "Confirmed"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-rose-100 text-rose-800"
                      }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${confirmedBooking.status === "Confirmed"
                        ? "bg-emerald-600"
                        : "bg-rose-600"
                        }`}
                    />
                    Booking {confirmedBooking.status}
                  </span>

                  <button
                    type="button"
                    onClick={() => setConfirmedBooking(null)}
                    className="text-xs font-medium text-teal-700 hover:underline"
                  >
                    + Book Another
                  </button>
                </div>

                <h2 className="text-xl font-bold text-slate-900">
                  Appointment Confirmation
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Save your booking reference below to look up or manage your
                  appointment.
                </p>

                {/* Reference Box */}
                <div className="mt-4 p-4 rounded-xl bg-slate-900 text-white flex items-center justify-between">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 block">
                      Booking Reference
                    </span>
                    <span className="text-lg font-mono font-bold tracking-wider">
                      {confirmedBooking.reference}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyReference(confirmedBooking.reference)}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium transition"
                  >
                    {copiedRef ? "Copied!" : "Copy"}
                  </button>
                </div>

                {/* Details List */}
                <dl className="mt-5 space-y-3 text-sm border-t border-slate-100 pt-4">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Practitioner</dt>
                    <dd className="font-semibold text-slate-900">
                      {confirmedBooking.practitioner}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Date</dt>
                    <dd className="font-medium text-slate-900">
                      {formatDate(confirmedBooking.startTime)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Time</dt>
                    <dd className="font-medium text-slate-900">
                      {formatTimeRange(
                        confirmedBooking.startTime,
                        confirmedBooking.endTime
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Patient Name</dt>
                    <dd className="font-medium text-slate-900">
                      {confirmedBooking.patientName}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Patient Email</dt>
                    <dd className="font-medium text-slate-900">
                      {confirmedBooking.patientEmail}
                    </dd>
                  </div>
                  {confirmedBooking.patientPhone && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Phone</dt>
                      <dd className="font-medium text-slate-900">
                        {confirmedBooking.patientPhone}
                      </dd>
                    </div>
                  )}
                  {confirmedBooking.reason && (
                    <div className="pt-2 border-t border-slate-100">
                      <dt className="text-slate-500 text-xs mb-1">
                        Reason for Visit
                      </dt>
                      <dd className="text-slate-800 bg-slate-50 rounded-lg p-2.5 text-xs">
                        {confirmedBooking.reason}
                      </dd>
                    </div>
                  )}
                </dl>

                {/* Actions */}
                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  {confirmedBooking.status === "Confirmed" && (
                    <button
                      type="button"
                      onClick={() =>
                        handleCancelBooking(confirmedBooking.reference)
                      }
                      className="flex-1 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold py-2.5 px-4 text-xs transition"
                    >
                      Cancel Appointment
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmedBooking(null)}
                    className="flex-1 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2.5 px-4 text-xs transition"
                  >
                    Book Another Slot
                  </button>
                </div>
              </div>
            ) : (
              /* BOOKING FORM VIEW */
              <form onSubmit={handleBookSlot} className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    2. Book Your Appointment
                  </h2>
                  <p className="text-sm text-slate-500">
                    Complete your details to confirm the selected slot.
                  </p>
                </div>

                {/* Selected Slot Summary */}
                {selectedSlot ? (
                  <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase text-teal-800">
                        {selectedSlot.practitioner}
                      </p>
                      <p className="text-sm font-bold text-slate-900">
                        {formatDate(selectedSlot.startTime)} •{" "}
                        {formatTimeRange(
                          selectedSlot.startTime,
                          selectedSlot.endTime
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedSlot(null)}
                      className="text-xs text-teal-700 hover:underline font-medium"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                    👈 Click on any available slot on the left to select an
                    appointment time.
                  </div>
                )}

                {bookingError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                    {bookingError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="e.g. Ada Lovelace"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={patientEmail}
                    onChange={(e) => setPatientEmail(e.target.value)}
                    placeholder="e.g. ada@example.com"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number{" "}
                    <span className="text-slate-400 font-normal">
                      (optional)
                    </span>
                  </label>
                  <input
                    type="tel"
                    value={patientPhone}
                    onChange={(e) => setPatientPhone(e.target.value)}
                    placeholder="e.g. +2348012345678"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reason for Visit{" "}
                    <span className="text-slate-400 font-normal">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Briefly describe your symptoms or check-up need..."
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!selectedSlot || submittingBooking}
                  className="w-full rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-semibold py-3 px-4 text-sm shadow-xs transition cursor-pointer disabled:cursor-not-allowed"
                >
                  {submittingBooking
                    ? "Confirming Appointment..."
                    : "Confirm Booking"}
                </button>
              </form>
            )}
          </section>
        </div>

        {/* BOTTOM SECTION: Look Up a Booking / View Patient Bookings */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 mb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                3. Look Up or Manage Existing Bookings
              </h2>
              <p className="text-sm text-slate-500">
                Check your booking confirmation by reference code or browse your
                appointments by email.
              </p>
            </div>

            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setLookupTab("reference");
                  setLookupError(null);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${lookupTab === "reference"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
                  }`}
              >
                By Booking Reference
              </button>
              <button
                type="button"
                onClick={() => {
                  setLookupTab("email");
                  setLookupError(null);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${lookupTab === "email"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
                  }`}
              >
                By Patient Email
              </button>
            </div>
          </div>

          {lookupTab === "reference" ? (
            <div>
              <form
                onSubmit={handleLookupByReference}
                className="flex flex-col sm:flex-row gap-3 max-w-lg"
              >
                <input
                  type="text"
                  value={lookupRef}
                  onChange={(e) => setLookupRef(e.target.value)}
                  placeholder="Enter reference (e.g. BK-7KQ2M9XA)"
                  className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-mono uppercase text-slate-900 focus:border-teal-600 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={lookupLoading}
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold px-5 py-2 text-sm transition"
                >
                  {lookupLoading ? "Searching..." : "Find Booking"}
                </button>
              </form>

              {lookupError && (
                <div className="mt-4 max-w-lg rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                  {lookupError}
                </div>
              )}

              {lookedUpBooking && (
                <div className="mt-5 p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-slate-900">
                        {lookedUpBooking.reference}
                      </span>
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${lookedUpBooking.status === "Confirmed"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                          }`}
                      >
                        {lookedUpBooking.status}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-800">
                      {lookedUpBooking.practitioner} —{" "}
                      {formatDate(lookedUpBooking.startTime)} (
                      {formatTimeRange(
                        lookedUpBooking.startTime,
                        lookedUpBooking.endTime
                      )}
                      )
                    </p>
                    <p className="text-xs text-slate-500">
                      Patient: {lookedUpBooking.patientName} (
                      {lookedUpBooking.patientEmail})
                    </p>
                  </div>

                  {lookedUpBooking.status === "Confirmed" && (
                    <button
                      type="button"
                      onClick={() =>
                        handleCancelBooking(lookedUpBooking.reference)
                      }
                      className="rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold px-3.5 py-2 text-xs transition"
                    >
                      Cancel Booking
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  fetchBookingsByEmail(1);
                }}
                className="flex flex-col sm:flex-row gap-3 max-w-lg"
              >
                <input
                  type="email"
                  value={lookupEmail}
                  onChange={(e) => setLookupEmail(e.target.value)}
                  placeholder="Enter patient email (e.g. ada@example.com)"
                  className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={lookupLoading}
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold px-5 py-2 text-sm transition"
                >
                  {lookupLoading ? "Loading..." : "Search Bookings"}
                </button>
              </form>

              {lookupError && (
                <div className="mt-4 max-w-lg rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                  {lookupError}
                </div>
              )}

              {patientBookings.length > 0 && (
                <div className="mt-5 space-y-3">
                  {patientBookings.map((b) => (
                    <div
                      key={b.id}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-slate-900">
                            {b.reference}
                          </span>
                          <span
                            className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${b.status === "Confirmed"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                              }`}
                          >
                            {b.status}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-slate-800">
                          {b.practitioner} — {formatDate(b.startTime)} (
                          {formatTimeRange(b.startTime, b.endTime)})
                        </p>
                      </div>

                      {b.status === "Confirmed" && (
                        <button
                          type="button"
                          onClick={() => handleCancelBooking(b.reference)}
                          className="rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold px-3.5 py-2 text-xs transition"
                        >
                          Cancel Booking
                        </button>
                      )}
                    </div>
                  ))}

                  {/* Email Bookings Pagination */}
                  <div className="pt-3 flex items-center justify-between text-xs text-slate-600">
                    <span>
                      Page <strong>{patientPage}</strong> of{" "}
                      <strong>{patientTotalPages}</strong> ({patientTotal} total
                      bookings)
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={patientPage <= 1}
                        onClick={() => fetchBookingsByEmail(patientPage - 1)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-medium"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={patientPage >= patientTotalPages}
                        onClick={() => fetchBookingsByEmail(patientPage + 1)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-medium"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

