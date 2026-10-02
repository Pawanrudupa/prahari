import { LandingNavbar } from "./components/LandingNavbar";
import { HeroSection } from "./components/HeroSection";
import { ProblemSection } from "./components/ProblemSection";
import { AgentJourneySection } from "./components/AgentJourneySection";
import { DecisionsInvariantSection } from "./components/DecisionsInvariantSection";
import { FeatureGridSection } from "./components/FeatureGridSection";
import { ArchitectureSection } from "./components/ArchitectureSection";
import { LandingFooter } from "./components/LandingFooter";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/20 selection:text-cyan-300">
      <LandingNavbar />
      <main className="flex-1">
        <HeroSection />
        <ProblemSection />
        <AgentJourneySection />
        <DecisionsInvariantSection />
        <FeatureGridSection />
        <ArchitectureSection />
      </main>
      <LandingFooter />
    </div>
  );
}
