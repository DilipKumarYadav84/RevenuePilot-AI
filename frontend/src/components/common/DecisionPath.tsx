import type { JourneyStepState } from "../../types/conversation";

const steps: Array<{ label: string; key: string }> = [
  { key: "need", label: "Need understood" },
  { key: "product", label: "Product matched" },
  { key: "offer", label: "Offer proposed" },
  { key: "policy", label: "Merchant policy checked" },
  { key: "payment", label: "Payment verified" },
];

export const DecisionPath = ({
  states,
}: {
  states: Record<string, JourneyStepState>;
}) => (
  <section className="decision-path" aria-label="How this decision was made">
    {steps.map((step) => (
      <div key={step.key} className={`decision-step ${states[step.key] ?? "idle"}`}>
        <span aria-hidden="true" />
        <p>{step.label}</p>
      </div>
    ))}
  </section>
);
