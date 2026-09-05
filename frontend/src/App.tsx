import { useState } from "react";

import "./App.css";
import { CustomerExperience } from "./components/customer/CustomerExperience";
import { DirectorMode } from "./components/director/DirectorMode";
import { MerchantConsole } from "./components/merchant/MerchantConsole";
import {
  type PresetScenario,
  ScenarioSimulator,
} from "./components/simulator/ScenarioSimulator";

type AppMode = "customer" | "merchant" | "director" | "simulator";
type ActiveScenarioRun = {
  id: string;
  prompts: string[];
};

function App() {
  const [mode, setMode] = useState<AppMode>("customer");
  const [activeScenarioRun, setActiveScenarioRun] = useState<ActiveScenarioRun | null>(null);

  const handleSelectScenario = (
    scenario: PresetScenario,
    promptIndex: number = 0,
  ) => {
    const promptCount = Math.max(1, promptIndex + 1);
    setActiveScenarioRun({
      id: `${scenario.id}:${promptIndex}:${Date.now()}`,
      prompts: scenario.prompts.slice(0, promptCount),
    });
    setMode("customer");
  };

  return (
    <main>
      <nav className="top-nav" aria-label="Primary">
        <div className="brand-group">
          <a href="#top" className="brand-mark" onClick={() => setMode("customer")}>
            <span className="brand-logo-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </span>
            <span className="brand-name">RevenuePilot AI</span>
          </a>
          <span className="buildathon-badge">Razorpay AI Buildathon</span>
        </div>

        <div className="mode-switch" role="tablist" aria-label="Demo mode" onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
          const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          event.preventDefault(); tabs[next]?.focus(); tabs[next]?.click();
        }}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "customer"}
            className={mode === "customer" ? "active" : ""}
            onClick={() => {
              setMode("customer");
            }}
          >
            Shopper Journey
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "merchant"}
            className={mode === "merchant" ? "active" : ""}
            onClick={() => setMode("merchant")}
          >
            Merchant Console
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "director"}
            className={mode === "director" ? "active highlight-director" : ""}
            onClick={() => setMode("director")}
          >
            Director Dual-View
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "simulator"}
            className={mode === "simulator" ? "active" : ""}
            onClick={() => setMode("simulator")}
          >
            Scenario Playbook
          </button>
        </div>
      </nav>

      <div hidden={mode !== "customer"}>
        <CustomerExperience
          key={activeScenarioRun?.id ?? "default-customer"}
          initialPrompts={activeScenarioRun?.prompts}
        />
      </div>
      {mode === "merchant" && <MerchantConsole />}
      {mode === "director" && <DirectorMode />}
      {mode === "simulator" && (
        <ScenarioSimulator onSelectScenario={handleSelectScenario} />
      )}
    </main>
  );
}

export default App;
