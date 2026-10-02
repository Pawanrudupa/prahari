const NAV_ITEMS = [
  { label: "Constellation", icon: "⬡", path: "/", implemented: true },
  { label: "Sessions", icon: "◎", path: "/sessions", implemented: false },
  { label: "Policies", icon: "◈", path: "/policies", implemented: false },
  { label: "Approvals", icon: "✋", path: "/approvals", implemented: false },
  { label: "Incidents", icon: "⚠", path: "/incidents", implemented: false },
  { label: "Replay", icon: "↻", path: "/replay", implemented: false },
  { label: "Red-team", icon: "⛨", path: "/redteam", implemented: false },
  { label: "Reports", icon: "📊", path: "/reports", implemented: false },
  { label: "Settings", icon: "⚙", path: "/settings", implemented: false },
] as const;

export function LeftRail() {
  return (
    <nav className="flex w-16 flex-col items-center gap-1.5 border-r border-white/10 bg-[var(--color-panel)] py-4 z-20 select-none">
      {NAV_ITEMS.map((item) => {
        if (item.implemented) {
          return (
            <button
              key={item.path}
              title={item.label}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-lg text-[#2DD4A7] bg-white/10 shadow-sm transition-colors cursor-pointer"
            >
              {item.icon}
            </button>
          );
        }

        return (
          <button
            key={item.path}
            disabled
            aria-disabled="true"
            title={`${item.label} — Coming soon`}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-lg text-white/25 cursor-not-allowed opacity-40 hover:opacity-50 transition-opacity"
          >
            {item.icon}
          </button>
        );
      })}
    </nav>
  );
}
