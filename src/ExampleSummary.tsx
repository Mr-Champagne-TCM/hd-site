import Summary, { type SummaryData } from "./Summary";

/**
 * The worked example.
 *
 * A real response from the real engine, for an invented birth moment, rendered
 * by the SAME component that renders a buyer's own. That sameness is the point:
 * this is a promise about what arrives, and a promise drawn by different code
 * than the thing it promises is a promise nobody is checking.
 *
 * Hard-coded rather than fetched. Calling the live endpoint to render an answer
 * that never changes would spend a rate-limit slot and wake a machine for every
 * visitor who scrolls past. Taken from a genuine call on 2026-08-27; refreshed
 * by hand if the shape changes, which the shared component makes obvious.
 *
 * NOT Jeremy's own chart, deliberately. His cross is his.
 */
const EXAMPLE: SummaryData = {
  type: "Manifesting Generator",
  strategy: "Wait to respond, then inform",
  authority: "Sacral",
  profile: "1/3",
  definition: "Split",
  notSelfTheme: "Frustration",
  signature: "Satisfaction",
  incarnationCross: "Right Angle Cross of Service (52/58 | 17/18)",
  definedCenters: ["Ajna", "Throat", "G", "Sacral", "Spleen", "Root"],
  // Three states, computed by the engine for this instant: the Heart carries a
  // gate of its own (undefined); Head and Solar Plexus carry none (open).
  undefinedCenters: ["Heart"],
  openCenters: ["Head", "Solar Plexus"],
  timeKnown: false,
  note: "Birth time unknown - charted at noon. Treat Type, Authority and Profile as provisional.",
  provisional: ["type", "strategy", "authority", "profile", "notSelfTheme", "signature"],
};

export default function ExampleSummary() {
  return <Summary data={EXAMPLE} />;
}
