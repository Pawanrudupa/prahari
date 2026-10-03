import { useState, useEffect } from "react";
import {
  Search,
  Camera,
  RotateCcw,
  Bot,
  Wrench,
} from "lucide-react";
import { useGraphStore } from "../../stores/useGraphStore";

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const agents = useGraphStore((s) => s.agents);
  const tools = useGraphStore((s) => s.tools);
  const setCameraPreset = useGraphStore((s) => s.setCameraPreset);
  const selectNode = useGraphStore((s) => s.selectNode);
  const clearEscalations = useGraphStore((s) => s.clearEscalations);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-2.5 py-1 rounded-lg border border-white/10 bg-slate-900/80 text-xs font-mono text-slate-400 hover:text-slate-200 hover:border-white/20 transition cursor-pointer"
        title="Open Command Palette (Ctrl+K)"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Commands</span>
        <kbd className="px-1.5 py-0.5 rounded bg-white/[0.08] text-[10px] text-slate-300">
          Ctrl+K
        </kbd>
      </button>
    );
  }

  const agentList = Array.from(agents.values()).filter((a) =>
    a.name.toLowerCase().includes(query.toLowerCase()),
  );
  const toolList = Array.from(tools.values()).filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-slate-950 p-4 shadow-2xl font-mono text-xs">
        {/* Search Input */}
        <div className="flex items-center gap-2.5 pb-3 border-b border-white/10">
          <Search className="w-4 h-4 text-cyan-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search nodes..."
            className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none font-sans"
          />
          <kbd
            onClick={() => setIsOpen(false)}
            className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-slate-400 cursor-pointer"
          >
            ESC
          </kbd>
        </div>

        {/* Command Items */}
        <div className="mt-3 max-h-72 overflow-y-auto space-y-1">
          <div className="text-[10px] font-semibold text-slate-500 uppercase px-2 py-1">
            Camera Presets
          </div>

          <button
            onClick={() => {
              setCameraPreset("overview");
              setIsOpen(false);
            }}
            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.06] text-left text-slate-200 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Camera className="w-3.5 h-3.5 text-cyan-400" />
              <span>Camera: Overview Angle</span>
            </span>
            <span className="text-[10px] text-slate-500">Preset</span>
          </button>

          <button
            onClick={() => {
              setCameraPreset("top_down");
              setIsOpen(false);
            }}
            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.06] text-left text-slate-200 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Camera className="w-3.5 h-3.5 text-cyan-400" />
              <span>Camera: Top-Down Orbital</span>
            </span>
            <span className="text-[10px] text-slate-500">Preset</span>
          </button>

          <button
            onClick={() => {
              setCameraPreset("follow_agent");
              setIsOpen(false);
            }}
            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.06] text-left text-slate-200 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Camera className="w-3.5 h-3.5 text-cyan-400" />
              <span>Camera: Focus Agent Node</span>
            </span>
            <span className="text-[10px] text-slate-500">Preset</span>
          </button>

          <div className="text-[10px] font-semibold text-slate-500 uppercase px-2 py-1 mt-2">
            Actions
          </div>

          <button
            onClick={() => {
              clearEscalations();
              setIsOpen(false);
            }}
            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.06] text-left text-slate-200 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Reset Badges & Risk Tints</span>
            </span>
            <span className="text-[10px] text-slate-500">Action</span>
          </button>

          {agentList.length > 0 && (
            <>
              <div className="text-[10px] font-semibold text-slate-500 uppercase px-2 py-1 mt-2">
                Agents ({agentList.length})
              </div>
              {agentList.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => {
                    selectNode(agent.id);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.06] text-left text-slate-200 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5 text-blue-400" />
                    <span>{agent.name}</span>
                  </span>
                  <span className="text-[10px] text-slate-500">{agent.role}</span>
                </button>
              ))}
            </>
          )}

          {toolList.length > 0 && (
            <>
              <div className="text-[10px] font-semibold text-slate-500 uppercase px-2 py-1 mt-2">
                Tools ({toolList.length})
              </div>
              {toolList.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => {
                    selectNode(tool.id);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.06] text-left text-slate-200 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Wrench className="w-3.5 h-3.5 text-slate-400" />
                    <span>{tool.name}</span>
                  </span>
                  <span className="text-[10px] text-slate-500">{tool.server}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
