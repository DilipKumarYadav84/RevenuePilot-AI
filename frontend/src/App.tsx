import { useState } from "react";

import "./App.css";
import { CustomerExperience } from "./components/customer/CustomerExperience";
import { MerchantConsole } from "./components/merchant/MerchantConsole";

type AppMode = "customer" | "merchant";

function App() {
  const [mode, setMode] = useState<AppMode>("customer");

  return (
    <main>
      <nav className="top-nav" aria-label="Primary">
        <a href="#top" className="brand-mark">
          RevenuePilot AI
        </a>
        <div className="mode-switch" role="tablist" aria-label="Demo mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "customer"}
            className={mode === "customer" ? "active" : ""}
            onClick={() => setMode("customer")}
          >
            Customer Experience
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
        </div>
      </nav>

      {mode === "customer" ? <CustomerExperience /> : <MerchantConsole />}
    </main>
  );
}

export default App;
