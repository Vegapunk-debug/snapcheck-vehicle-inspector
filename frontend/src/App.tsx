import { Link, NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { getHealth } from "./api";

type HealthState = "loading" | "ok" | "down";

const POLL_INTERVAL_MS = 15_000;

export default function App() {
  const [healthState, setHealthState] = useState<HealthState>("loading");
  const [healthMessage, setHealthMessage] = useState("checking…");

  // Poll /health every 15s. Drives the topbar dot.
  useEffect(() => {
    let isCancelled = false;

    const pollHealth = async () => {
      try {
        const health = await getHealth();
        if (isCancelled) return;

        if (health.status === "ok") {
          setHealthState("ok");
          setHealthMessage("all systems ok");
          return;
        }

        const failingChecks = Object.entries(health.checks ?? {})
          .filter(([, value]) => value !== "ok")
          .map(([name]) => name);

        setHealthState("down");
        setHealthMessage(`degraded: ${failingChecks.join(", ") || "unknown"}`);
      } catch {
        if (isCancelled) return;
        setHealthState("down");
        setHealthMessage("api unreachable");
      }
    };

    pollHealth();
    const intervalId = setInterval(pollHealth, POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return (
    <>
      <div className="bg-grid" aria-hidden />
      <div className="bg-glow" aria-hidden />

      <header className="topbar">
        <Link to="/" className="brand">
          <div className="brand-mark" aria-label="snapcheck logo">
            <svg viewBox="0 0 64 64" width="24" height="24" fill="none">
              <circle cx="27" cy="27" r="13" stroke="#fff" strokeWidth="4" />
              <path d="M21 27 L26 32 L34 22" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M37 37 L48 48" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="brand-name">snapcheck</div>
            <div className="brand-sub">vehicle image inspector</div>
          </div>
        </Link>

        <nav className="topbar-nav">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "is-active" : ""}`}>
            Upload
          </NavLink>
        </nav>

        <div className="topbar-right">
          <div className="health">
            <span className="health-dot" data-state={healthState} />
            <span className="health-text">{healthMessage}</span>
          </div>
        </div>
      </header>

      <main className="page">
        <Outlet />
      </main>

      <footer className="footer">
        snapcheck — intelligent media processing pipeline · built for Ginger Media Group
      </footer>
    </>
  );
}
