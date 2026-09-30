import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
CartesianGrid,
Line,
LineChart,
ReferenceLine,
ResponsiveContainer,
Tooltip,
XAxis,
YAxis,
} from "recharts";
import { api, type ApiResponse } from "./api";

type Dashboard = ApiResponse<typeof api, "getDashboard">;
type Watch = Dashboard["watches"][number];
type Observation = Watch["observations"][number];

function money(cents: number | null) {
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function dateValue(value: string) {
  return new Date(`${value}T12:00:00`);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(dateValue(value));
}

function fullDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(dateValue(value));
}

function CalendarDate({ value, label }: { value: string; label: string }) {
  const date = dateValue(value);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
  const monthDay = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(date);
  const year = new Intl.DateTimeFormat("en-US", { year: "numeric" }).format(date);

  return (
    <div className="calendar-date" aria-label={`${label}: ${fullDate(value)}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--dim)]">{label}</span>
      <span className="mt-1 block text-sm font-semibold text-[var(--accent)]">{weekday}</span>
      <span className="block text-base font-semibold">{monthDay}</span>
      <span className="mono mt-0.5 block text-xs text-[var(--dim)]">{year}</span>
    </div>
  );
}

function todayLocal() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function durationLabel(minutes: number | null) {
  if (minutes === null) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

function TrendChart({ watch, windowSize }: { watch: Watch; windowSize: number }) {
  const data = useMemo(() => {
    const all = watch.forecast.series.map((point) => ({
      x: Date.parse(`${point.date}T00:00:00`),
      date: point.date,
      actual: point.price_cents,
      forecast: null as number | null,
    }));
    if (watch.forecast.ready && watch.forecast.estimate_cents !== null && watch.forecast.forecast_date) {
      const last = all[all.length - 1];
      if (last) last.forecast = last.actual;
      all.push({
        x: Date.parse(`${watch.forecast.forecast_date}T00:00:00`),
        date: watch.forecast.forecast_date,
        actual: null as unknown as number,
        forecast: watch.forecast.estimate_cents,
      });
    }
    return all;
  }, [watch]);

  if (data.length === 0) {
    return <div className="grid h-52 place-items-center text-sm text-[var(--dim)]">Log the first fare to start the trend.</div>;
  }

  const lastActualX = watch.forecast.series.at(-1)?.date;

  return (
    <div className="h-56 w-full" role="img" aria-label={`Fare history for ${watch.label}. ${watch.forecast.series.length} daily low prices plotted; forecast uses up to ${windowSize}.`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 8, bottom: 2, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
          <XAxis
            dataKey="x"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(value: number) => shortDate(new Date(value).toISOString().slice(0, 10))}
            tick={{ fill: "var(--dim)", fontSize: 11, fontFamily: "IBM Plex Mono" }}
            axisLine={false}
            tickLine={false}
            minTickGap={36}
          />
          <YAxis
            tickFormatter={(value: number) => `$${Math.round(value / 100)}`}
            tick={{ fill: "var(--dim)", fontSize: 11, fontFamily: "IBM Plex Mono" }}
            width={48}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            labelFormatter={(value) => fullDate(new Date(Number(value)).toISOString().slice(0, 10))}
            formatter={(value, name) => [money(Number(value)), name === "actual" ? "Daily low" : "7-day estimate"]}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", fontSize: 12 }}
          />
          {lastActualX && watch.forecast.ready ? (
            <ReferenceLine x={Date.parse(`${lastActualX}T00:00:00`)} stroke="var(--border)" strokeDasharray="2 4" />
          ) : null}
          <Line type="monotone" dataKey="actual" name="actual" stroke="var(--accent)" strokeWidth={3} dot={{ r: 4, fill: "var(--surface)", strokeWidth: 3 }} activeDot={{ r: 6 }} connectNulls={false} />
          <Line type="monotone" dataKey="forecast" name="forecast" stroke="var(--signal)" strokeWidth={3} strokeDasharray="7 6" dot={{ r: 4, fill: "var(--surface)", strokeWidth: 3 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function AddFareSheet({ watch, onClose }: { watch: Watch; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [checkedAt, setCheckedAt] = useState(todayLocal());
  const [airline, setAirline] = useState("");
  const [price, setPrice] = useState("");
  const [stops, setStops] = useState("0");
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const mutation = useMutation({
    mutationFn: () => api.addObservation({
      watch_id: watch.id,
      checked_at: checkedAt,
      airline,
      price_cents: Math.round(Number(price) * 100),
      stops: Number(stops),
      duration_minutes: duration ? Number(duration) : null,
      note,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!price || Number(price) <= 0) return;
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#07131f99] p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="fare-sheet-title">
      <form onSubmit={submit} className="sheet-panel max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[22px] bg-[var(--surface)] px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 shadow-[var(--shadow)] sm:rounded-[22px]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[var(--accent)]">{watch.label}</p>
            <h2 id="fare-sheet-title" className="mt-1 text-2xl font-semibold">Log a fare</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close fare form" className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-strong)] text-xl">×</button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">Checked on
            <input type="date" value={checkedAt} onChange={(event) => setCheckedAt(event.target.value)} required className="h-12 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[var(--text)]" />
            <span className="text-xs font-normal text-[var(--dim)]">{fullDate(checkedAt)}</span>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Round-trip price
            <div className="flex h-12 items-center rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 focus-within:border-[var(--accent)]">
              <span className="mono text-[var(--dim)]">$</span>
              <input aria-label="Round-trip price in dollars" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} required className="mono min-w-0 flex-1 bg-transparent px-1 outline-none" placeholder="0.00" />
            </div>
          </label>
          <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Airline
            <input value={airline} onChange={(event) => setAirline(event.target.value)} required placeholder="Airline or itinerary" className="h-12 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[var(--text)]" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Stops
            <select value={stops} onChange={(event) => setStops(event.target.value)} className="h-12 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[var(--text)]">
              <option value="0">Nonstop</option><option value="1">1 stop</option><option value="2">2 stops</option><option value="3">3+ stops</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Duration, minutes <span className="font-normal text-[var(--dim)]">optional</span>
            <input type="number" min="1" max="3000" value={duration} onChange={(event) => setDuration(event.target.value)} className="h-12 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[var(--text)]" placeholder="145" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Note <span className="font-normal text-[var(--dim)]">optional</span>
            <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={160} className="h-12 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[var(--text)]" placeholder="Basic fare, carry-on included…" />
          </label>
        </div>
        {mutation.error ? <p className="mt-4 text-sm text-[var(--danger)]">{String(mutation.error)}</p> : null}
        <button type="submit" disabled={mutation.isPending} className="mt-6 h-12 w-full rounded-[11px] bg-[var(--accent)] font-semibold text-white disabled:opacity-60">{mutation.isPending ? "Saving…" : "Save fare"}</button>
      </form>
    </div>
  );
}

function ObservationRow({ observation }: { observation: Observation }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.deleteObservation({ id: observation.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  });
  const tripDetail = observation.stops === 0 ? "Nonstop" : `${observation.stops} stop${observation.stops === 1 ? "" : "s"}`;
  const duration = durationLabel(observation.duration_minutes);

  return (
    <li className="grid grid-cols-[1fr_auto] gap-3 border-b border-[var(--border)] py-4 last:border-b-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="font-semibold">{observation.airline}</p>
          <p className="text-xs text-[var(--dim)]">{fullDate(observation.checked_at)}</p>
        </div>
        <p className="mt-1 text-sm text-[var(--dim)]">{tripDetail}{duration ? ` · ${duration}` : ""}{observation.note ? ` · ${observation.note}` : ""}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="mono font-semibold tabular-nums">{money(observation.price_cents)}</span>
        <button type="button" onClick={() => remove.mutate()} disabled={remove.isPending} aria-label={`Remove ${observation.airline} fare from ${fullDate(observation.checked_at)}`} className="grid h-9 w-9 place-items-center rounded-full text-lg text-[var(--dim)] hover:bg-[var(--surface-strong)]">×</button>
      </div>
    </li>
  );
}

function Settings({ dashboard }: { dashboard: Dashboard }) {
  const route = dashboard.route;
  const queryClient = useQueryClient();
  const [travelers, setTravelers] = useState(route?.traveler_count ?? 1);
  const [days, setDays] = useState(route?.trip_length_days ?? 3);
  const [label, setLabel] = useState("");
  const [departure, setDeparture] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [cadence, setCadence] = useState("Weekly");

  useEffect(() => {
    if (route) {
      setTravelers(route.traveler_count);
      setDays(route.trip_length_days);
    }
  }, [route]);

  const update = useMutation({
    mutationFn: () => route ? api.updateRoute({ id: route.id, traveler_count: travelers, trip_length_days: days }) : Promise.reject(new Error("No route")),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  });
  const addWatch = useMutation({
    mutationFn: () => route ? api.addWatch({ route_id: route.id, label, target_departure: departure, target_return: returnDate, cadence }) : Promise.reject(new Error("No route")),
    onSuccess: async () => {
      setLabel(""); setDeparture(""); setReturnDate("");
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  if (!route) return null;
  return (
    <details className="border-t border-[var(--border)] py-5">
      <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--dim)]">Route settings & new watch</summary>
      <div className="mt-5 grid gap-7 md:grid-cols-2">
        <form onSubmit={(event) => { event.preventDefault(); update.mutate(); }}>
          <h3 className="font-semibold">Tracking assumptions</h3>
          <p className="mt-1 text-sm text-[var(--dim)]">Used as context for this route.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">Travelers<input aria-label="Traveler count" type="number" min="1" max="9" value={travelers} onChange={(event) => setTravelers(Number(event.target.value))} className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3" /></label>
            <label className="grid gap-1.5 text-sm">Trip length<input aria-label="Trip length in days" type="number" min="1" max="30" value={days} onChange={(event) => setDays(Number(event.target.value))} className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3" /></label>
          </div>
          <button type="submit" disabled={update.isPending} className="mt-3 h-10 rounded-[10px] border border-[var(--border)] px-4 text-sm font-semibold">{update.isPending ? "Saving…" : "Save assumptions"}</button>
        </form>
        <form onSubmit={(event) => { event.preventDefault(); addWatch.mutate(); }}>
          <h3 className="font-semibold">Add travel dates</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm sm:col-span-2">Watch label<input value={label} onChange={(event) => setLabel(event.target.value)} required className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3" placeholder="Early January" /></label>
            <label className="grid gap-1.5 text-sm">Depart<input type="date" value={departure} onChange={(event) => setDeparture(event.target.value)} required className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3" />{departure ? <span className="text-xs text-[var(--dim)]">{fullDate(departure)}</span> : null}</label>
            <label className="grid gap-1.5 text-sm">Return<input type="date" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} required className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3" />{returnDate ? <span className="text-xs text-[var(--dim)]">{fullDate(returnDate)}</span> : null}</label>
            <label className="grid gap-1.5 text-sm sm:col-span-2">Check rhythm<input value={cadence} onChange={(event) => setCadence(event.target.value)} required className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3" /></label>
          </div>
          {addWatch.error ? <p className="mt-2 text-sm text-[var(--danger)]">{String(addWatch.error)}</p> : null}
          <button type="submit" disabled={addWatch.isPending} className="mt-3 h-10 rounded-[10px] border border-[var(--border)] px-4 text-sm font-semibold">{addWatch.isPending ? "Adding…" : "Add watch"}</button>
        </form>
      </div>
    </details>
  );
}

export function App() {
  const [windowSize, setWindowSize] = useState(5);
  const [activeWatchId, setActiveWatchId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const dashboard = useQuery({
    queryKey: ["dashboard", windowSize],
    queryFn: () => api.getDashboard({ window_size: windowSize }),
  });

  const watches = dashboard.data?.watches ?? [];
  const activeWatch = watches.find((watch) => watch.id === activeWatchId) ?? watches[0] ?? null;

  useEffect(() => {
    if (activeWatchId === null && watches[0]) setActiveWatchId(watches[0].id);
  }, [activeWatchId, watches]);

  if (dashboard.isPending) {
    return <div className="min-h-screen bg-[var(--bg)]"><SafeAreaTopScrim backgroundColor="var(--bg)" /><main className="grid min-h-[70vh] place-items-center px-5 text-sm text-[var(--dim)]">Loading fare history…</main></div>;
  }
  if (dashboard.error || !dashboard.data?.route) {
    return <div className="min-h-screen bg-[var(--bg)]"><SafeAreaTopScrim backgroundColor="var(--bg)" /><main className="grid min-h-[70vh] place-items-center px-5 text-center"><div><p className="font-semibold">Fare history could not load.</p><button onClick={() => dashboard.refetch()} className="mt-4 rounded-[10px] bg-[var(--accent)] px-4 py-2 font-semibold text-white">Try again</button></div></main></div>;
  }

  const route = dashboard.data.route;
  const latestLowest = activeWatch?.observations.length ? Math.min(...activeWatch.observations.map((item) => item.price_cents)) : null;
  const activeWatchIsSameDay = activeWatch?.target_departure === activeWatch?.target_return;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto max-w-5xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6">
        <header className="flex items-end justify-between gap-4 border-b border-[var(--border)] pb-5 pt-8">
          <div>
            <div className="flex items-center gap-3">
              <span className="mono text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{route.origin}</span>
              <span aria-hidden="true" className="text-2xl text-[var(--accent)]">→</span>
              <span className="mono text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{route.destination}</span>
            </div>
            <p className="mt-2 text-sm text-[var(--dim)]">{route.traveler_count} traveler · about {route.trip_length_days} days · round trip</p>
          </div>
          <button type="button" onClick={() => setSheetOpen(true)} disabled={!activeWatch} className="h-11 shrink-0 rounded-[11px] bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-50">Log fare</button>
        </header>

        <nav aria-label="Travel date watches" className="grid gap-2 py-5 sm:grid-cols-2 lg:grid-cols-3">
          {watches.map((watch) => {
            const selected = activeWatch?.id === watch.id;
            const sameDay = watch.target_departure === watch.target_return;
            return (
              <button key={watch.id} type="button" onClick={() => setActiveWatchId(watch.id)} aria-pressed={selected} className={`min-w-0 rounded-[12px] px-4 py-3 text-left transition-colors ${selected ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--surface)] text-[var(--text)]"}`}>
                <span className="block text-sm font-semibold">{watch.label}</span>
                <span className={`mt-1 block text-xs leading-5 ${selected ? "opacity-75" : "text-[var(--dim)]"}`}>
                  {sameDay ? `Same day · ${fullDate(watch.target_departure)}` : `${fullDate(watch.target_departure)} – ${fullDate(watch.target_return)}`}
                </span>
              </button>
            );
          })}
        </nav>

        {activeWatch ? (
          <>
            <section className="overflow-hidden rounded-[18px] bg-[var(--surface)] shadow-[var(--shadow)]">
              <div className="border-b border-[var(--border)] p-5 sm:p-7">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{activeWatch.label}</p>
                    <p className="mt-0.5 text-xs text-[var(--dim)]">{activeWatchIsSameDay ? "Out and back on one calendar day" : "Round-trip travel window"}</p>
                  </div>
                  {activeWatchIsSameDay ? <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">Same day</span> : null}
                </div>
                <div className={`mt-4 grid gap-2 ${activeWatchIsSameDay ? "grid-cols-1" : "grid-cols-2"}`}>
                  <CalendarDate value={activeWatch.target_departure} label="Depart" />
                  {activeWatchIsSameDay ? null : <CalendarDate value={activeWatch.target_return} label="Return" />}
                </div>
              </div>

              <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-start sm:p-7">
                <div>
                  <p className="text-sm font-medium text-[var(--dim)]">7-day estimate</p>
                  {activeWatch.forecast.ready ? (
                    <div className="mt-1">
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <p className="mono text-3xl font-semibold tracking-[-0.04em]">{money(activeWatch.forecast.estimate_cents)}</p>
                        <p className={`mono text-sm font-medium ${(activeWatch.forecast.daily_slope_cents ?? 0) <= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
                          {(activeWatch.forecast.daily_slope_cents ?? 0) > 0 ? "+" : ""}{money(activeWatch.forecast.daily_slope_cents)}/day
                        </p>
                      </div>
                      {activeWatch.forecast.forecast_date ? <p className="mt-1 text-xs text-[var(--dim)]">For {fullDate(activeWatch.forecast.forecast_date)}</p> : null}
                    </div>
                  ) : (
                    <div className="mt-2">
                      <p className="text-xl font-semibold">Building the signal</p>
                      <p className="mt-1 text-sm text-[var(--dim)]">{activeWatch.forecast.points_needed > 0 ? `${activeWatch.forecast.points_needed} more check-in${activeWatch.forecast.points_needed === 1 ? "" : "s"} needed for a trend.` : "The current dates do not support a stable trend."}</p>
                    </div>
                  )}
                </div>
                <div className="sm:text-right">
                  <p className="text-xs text-[var(--dim)]">Latest low</p>
                  <p className="mono mt-1 text-xl font-semibold">{money(latestLowest)}</p>
                  <p className="mt-1 text-xs text-[var(--dim)]">{activeWatch.cadence}</p>
                </div>
              </div>

              <div className="border-t border-[var(--border)] px-1 pb-2 pt-2 sm:px-4">
                <TrendChart watch={activeWatch} windowSize={windowSize} />
              </div>
              <div className="border-t border-[var(--border)] px-5 py-4 sm:px-7">
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor="window-size" className="text-sm font-medium">Sliding window</label>
                  <output htmlFor="window-size" className="mono text-sm font-semibold">{windowSize} checks</output>
                </div>
                <input id="window-size" aria-label="Prediction window in daily fare checks" type="range" min="3" max="12" step="1" value={windowSize} onChange={(event) => setWindowSize(Number(event.target.value))} className="mt-2 w-full accent-[var(--accent)]" />
                <p className="mt-1 text-xs leading-5 text-[var(--dim)]">Forecast fits a straight trend to the lowest fare from each of the last {windowSize} check dates. Dashed values are estimates, not live quotes.</p>
              </div>
            </section>

            <section className="py-7">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Fare log</h2>
                  <p className="mt-1 text-sm text-[var(--dim)]">All observed options for this watch.</p>
                </div>
                <span className="mono text-xs text-[var(--dim)]">{activeWatch.observations.length} quote{activeWatch.observations.length === 1 ? "" : "s"}</span>
              </div>
              {activeWatch.observations.length ? (
                <ul className="mt-3"><>{activeWatch.observations.map((observation) => <ObservationRow key={observation.id} observation={observation} />)}</></ul>
              ) : (
                <div className="mt-4 rounded-[14px] bg-[var(--surface)] p-5 text-sm text-[var(--dim)]">No fares recorded for these dates yet.</div>
              )}
            </section>
          </>
        ) : (
          <section className="rounded-[18px] bg-[var(--surface)] p-6"><p className="font-semibold">Add travel dates to begin.</p></section>
        )}

        <Settings dashboard={dashboard.data} />
      </main>
      {sheetOpen && activeWatch ? <AddFareSheet watch={activeWatch} onClose={() => setSheetOpen(false)} /> : null}
    </div>
  );
}
