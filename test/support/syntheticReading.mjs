import { HEADINGS, INTERPRETATION, MECHANICS, TAKEAWAYS, DISCLAIMER } from "../../netlify/lib/interpretation.mjs";

/**
 * A reading with the exact STRUCTURE the model must return -- every marker,
 * every summary row, one-per-line lists -- and plain placeholder sentences,
 * so layout tests can run on any chart without committing real model
 * writing to this public repo. Not copy; nothing here is ever shown to a
 * buyer.
 */
const words = (label, n) =>
  `Placeholder sentence for ${label}, written only so this page has something of a real length to lay out ` +
  "and break across lines the way a reading does. ".repeat(n).trim();

export function syntheticReading(chart) {
  const lines = ["IN SHORT", ""];
  for (const [k, label] of [["Type", "type"], ["Strategy", "strategy"], ["Authority", "authority"], ["Profile", "profile"], ["Signature", "on track"], ["Not-self", "off track"]]) {
    lines.push(`${k}: The ${label} sentence of this placeholder reading, a single line long.`);
  }
  for (const h of HEADINGS) {
    lines.push("", h, "");
    if (h === MECHANICS[2]) {
      (chart.channelLines ?? []).forEach((c) => lines.push(`${c}: The placeholder sentence about this channel.`));
      if (!(chart.channelLines ?? []).length) lines.push("No defined channels.");
    } else if (h === MECHANICS[3]) {
      const m = /^(\d)\/(\d)/.exec(chart.profile ?? "") ?? [];
      lines.push(`Line ${m[1]} (Line), conscious: The placeholder sentence about the conscious line.`);
      lines.push(`Line ${m[2]} (Line), unconscious: The placeholder sentence about the unconscious line.`);
    } else if (h === TAKEAWAYS) {
      lines.push("These are invitations to test against your own experience, not rules.");
      for (const f of ["Authority", "Strategy", "Profile"]) lines.push(`(${f}) Notice what happens in a placeholder week.`);
    } else if (INTERPRETATION.includes(h)) {
      lines.push(`The lead line for ${h.toLowerCase()}, as a placeholder.`, "", words(h, 3), "", words(h, 2));
    } else {
      lines.push(words(h, 3));
    }
  }
  lines.push("", DISCLAIMER);
  return lines.join("\n");
}
