const NAV_ITEMS = [
  { label: "Constellation", icon: "⬡", path: "/" },
  { label: "Sessions", icon: "◎", path: "/sessions" },
  { label: "Policies", icon: "◈", path: "/policies" },
  { label: "Approvals", icon: "✋", path: "/approvals" },
  { label: "Incidents", icon: "⚠", path: "/incidents" },
  { label: "Replay", icon: "↻", path: "/replay" },
  { label: "Red-team", icon: "⛨", path: "/redteam" },
  { label: "Reports", icon: "📊", path: "/reports" },
  { label: "Settings", icon: "⚙", path: "/settings" },
] as const;

export function LeftRail() {
  return (
    <nav className="flex w-16 flex-col items-center gap-1 border-r border-white/10 bg-[var(--color-panel)] py-4">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.path}
          title={item.label}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-lg text-[var(--color-text-muted)] transition-colors hover:bg-white/10 hover:text-[var(--color-text)]"
        >
          {item.icon}
        </button>
      ))}
    </nav>
  );
}
