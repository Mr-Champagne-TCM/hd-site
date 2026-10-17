import Summary, { type SummaryData } from "./Summary";

/**
 * The worked example.
 *
 * A real response from the real engine, rendered by the SAME component that
 * renders a buyer's own. That sameness is the point: this is a promise about
 * what arrives, and a promise drawn by different code than the thing it
 * promises is a promise nobody is checking.
 *
 * Hard-coded rather than fetched. Calling the live endpoint to render an answer
 * that never changes would spend a rate-limit slot and wake a machine for every
 * visitor who scrolls past. Refreshed by hand if the shape changes, which the
 * shared component makes obvious.
 *
 * JEREMY'S OWN CHART since 10/16 (one example everywhere -- "OK to use mine",
 * "my name is OK"): September 17, 1983, 3:17 AM, Wichita Falls, Texas, copied
 * from his real shop record (engine 0.5.0), the same chart as the readings
 * page and the library's example charts. Birth time known, so nothing is
 * provisional and there is no noon note. The summary tier shows no channels.
 */
const EXAMPLE: SummaryData = {
  type: "Manifesting Generator",
  strategy: "Wait to respond, then inform",
  authority: "Sacral",
  profile: "2/4",
  definition: "Single",
  notSelfTheme: "Frustration",
  signature: "Satisfaction",
  incarnationCross: "Right Angle Cross of Eden (6/36 | 12/11)",
  definedCenters: ["Throat", "Sacral"],
  // Three states, as the engine computed them: these five carry at least one
  // lit gate (undefined); Head and G carry none (open).
  undefinedCenters: ["Ajna", "Heart", "Spleen", "Solar Plexus", "Root"],
  openCenters: ["Head", "G"],
  timeKnown: true,
};

export default function ExampleSummary() {
  return <Summary data={EXAMPLE} />;
}
