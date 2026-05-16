import type { StatsResponse } from "../api";

export function StatsBar({ stats }: { stats: StatsResponse | null }) {
  return (
    <div className="stats">
      <div className="stat">
        <div className="stat-num">{stats?.total ?? "—"}</div>
        <div className="stat-label">total</div>
      </div>
      <div className="stat stat-yellow">
        <div className="stat-num">{stats?.pending ?? "—"}</div>
        <div className="stat-label">pending</div>
      </div>
      <div className="stat stat-blue">
        <div className="stat-num">{stats?.processing ?? "—"}</div>
        <div className="stat-label">processing</div>
      </div>
      <div className="stat stat-green">
        <div className="stat-num">{stats?.completed ?? "—"}</div>
        <div className="stat-label">completed</div>
      </div>
      <div className="stat stat-red">
        <div className="stat-num">{stats?.failed ?? "—"}</div>
        <div className="stat-label">failed</div>
      </div>
    </div>
  );
}
