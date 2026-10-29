import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from './Logo';

function DashboardIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="2.2" />
      <rect x="13" y="3" width="8" height="8" rx="2.2" />
      <rect x="3" y="13" width="8" height="8" rx="2.2" />
      <rect x="13" y="13" width="8" height="8" rx="2.2" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <Logo />
          <span>AdPilot</span>
        </Link>
        <nav aria-label="Main">
          <Link href="/" className="nav-item active" aria-current="page">
            <DashboardIcon />
            <span>Dashboard</span>
          </Link>
        </nav>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <Link href="/" className="brand">
            <Logo size={32} />
            <span>AdPilot</span>
          </Link>
        </header>
        {children}
      </div>
    </div>
  );
}