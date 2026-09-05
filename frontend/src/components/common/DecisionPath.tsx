import type { JourneyStepState } from "../../types/conversation";

const steps: Array<{ label: string; key: string; owner: string }> = [
  { key: "need", label: "Need understood", owner: "AI" },
  { key: "product", label: "Product matched", owner: "Catalog" },
  { key: "offer", label: "Offer proposed", owner: "AI" },
  { key: "policy", label: "Merchant policy checked", owner: "Policy" },
  { key: "accept", label: "Customer accepts", owner: "Customer" },
  { key: "payment", label: "Payment verified", owner: "Razorpay" },
];

const stateLabels: Record<JourneyStepState, string> = {
  idle: "Waiting",
  active: "Current",
  done: "Completed",
  blocked: "Stopped",
};

export const DecisionPath = ({
  states,
}: {
  states: Record<string, JourneyStepState>;
}) => (
  <section className="decision-path" aria-label="How this decision was made">
    <div className="decision-path-heading">
      <p className="eyebrow">How RevenuePilot works</p>
      <h2>From intent to a verified purchase</h2>
    </div>
    {steps.map((step) => {
      const state = states[step.key] ?? "idle";

      return (
      <div key={step.key} className={`decision-step ${state}`}>
        <span className="decision-marker" aria-hidden="true">
          {state === "done" ? "✓" : state === "blocked" ? "!" : ""}
        </span>
        <div>
          <p>{step.label}</p>
          <small>{step.owner} · {stateLabels[state]}</small>
        </div>
      </div>
      );
    })}
  </section>
);
