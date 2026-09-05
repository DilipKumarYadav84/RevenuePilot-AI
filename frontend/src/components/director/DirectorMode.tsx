import { CustomerExperience } from "../customer/CustomerExperience";
import { ControlTower } from "./ControlTower";

export const DirectorMode = () => <section className="director-mode-container">
  <header className="shopper-heading"><div><p className="eyebrow">Director Dual-View</p><h1>One journey. Every decision explained.</h1></div><span className="mode-pill">Razorpay Test Mode</span></header>
  <CustomerExperience hideHero renderInspector={journey => <ControlTower journey={journey} />} />
</section>;
