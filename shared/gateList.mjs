/**
 * THE ACTIVATED GATES AS A LINE OF NUMBERS (Jeremy 10/22: "gates/channels go
 * to summary (with no explanation)"): "4, 6, 9, 11", lowest first, nothing
 * else -- no names, no lines, no planets (those stay the reading's).
 * One function, so the page, the summary and the PDF print the same line.
 */
export function gateList(gates) {
  return Array.isArray(gates) && gates.length ? [...gates].map(Number).sort((a, b) => a - b).join(", ") : "None";
}
