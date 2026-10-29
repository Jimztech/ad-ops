'use client';

import { useState, useSyncExternalStore } from 'react';

type PlatformFilter = '' | 'facebook' | 'instagram' | 'other';

const DAY_MS = 86_400_000;

// Pure helper: builds a date from another date string. It never reads the clock.
const shiftDay = (isoDate: string, days: number) =>
  new Date(Date.parse(isoDate) + days * DAY_MS).toISOString().slice(0, 10);

// "Today" is read through useSyncExternalStore. React uses the server value ('')
// while pre-building and hydrating, then switches to the real date in the browser.
const subscribe = () => () => {};
const readToday = () => new Date().toISOString().slice(0, 10);
const readTodayOnServer = () => '';
function useToday() {
  return useSyncExternalStore(subscribe, readToday, readTodayOnServer);
}

export function Dashboard() {
  const today = useToday();
  const [picked, setPicked] = useState<{ from?: string; to?: string }>({});
  const [platform, setPlatform] = useState<PlatformFilter>('');

  // Defaults apply until the user picks a date, and end yesterday (the sync's last full day).
  const from = picked.from ?? (today ? shiftDay(today, -30) : '');
  const to = picked.to ?? (today ? shiftDay(today, -1) : '');

  return (
    <main className="content">
      <div className="page-head">
        <h1>Dashboard</h1>
        <div className="filters">
          <label className="pill">
            <span className="sr-only">From</span>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setPicked((p) => ({ ...p, from: e.target.value }))}
            />
          </label>
          <label className="pill">
            <span className="sr-only">To</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setPicked((p) => ({ ...p, to: e.target.value }))}
            />
          </label>
          <label className="pill">
            <span className="sr-only">Platform</span>
            <select value={platform} onChange={(e) => setPlatform(e.target.value as PlatformFilter)}>
              <option value="">All platforms</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
      </div>

      <div className="dash-grid">
        <div className="kpis">
          {['Spend', 'Revenue', 'ROAS', 'CPA'].map((name) => (
            <div key={name} className="card placeholder kpi">{name}</div>
          ))}
        </div>
        <div className="row">
          <div className="card placeholder chart">Revenue &amp; spend chart</div>
          <div className="card placeholder chart">Platform split</div>
        </div>
        <div className="row">
          <div className="card placeholder list">Campaigns</div>
          <div className="card placeholder list">Top campaigns by ROAS</div>
        </div>
      </div>
    </main>
  );
}