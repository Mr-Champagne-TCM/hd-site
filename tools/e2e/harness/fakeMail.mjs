/**
 * A FAKE RESEND: every email the site sends is written to the run's outbox
 * as .json (headers), .html and .txt, numbered in the order sent. Nothing is
 * delivered. Alerts to Jeremy land here too, which is how a run sees an
 * incident the site would have paged him about.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function fakeMail({ dir }) {
  mkdirSync(dir, { recursive: true });
  const sent = [];
  async function api(request) {
    const body = await request.json().catch(() => null);
    if (!body?.to || !body?.subject) {
      return new Response(JSON.stringify({ message: "rig: missing to/subject" }), { status: 422 });
    }
    const n = String(sent.length + 1).padStart(3, "0");
    const to = Array.isArray(body.to) ? body.to.join(",") : String(body.to);
    const slug = String(body.subject).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
    const base = join(dir, `${n}-${slug}`);
    const meta = { n: Number(n), at: Date.now(), from: body.from, replyTo: body.reply_to, to, subject: body.subject, file: base };
    writeFileSync(base + ".json", JSON.stringify(meta, null, 1));
    writeFileSync(base + ".html", body.html ?? "");
    writeFileSync(base + ".txt", body.text ?? "");
    sent.push(meta);
    return new Response(JSON.stringify({ id: `rig-mail-${n}` }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return { api, sent };
}
