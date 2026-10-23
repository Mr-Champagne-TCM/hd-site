import { CONTACT } from "./copy";
import { HINT, hint } from "../shared/linkHints.mjs";

/**
 * A sentence that names the readings address, with the address as a real
 * mailto link (link audit, Jeremy 10/16): one tap opens a reply, instead of
 * an address somebody has to copy out of a paragraph.
 *
 * The sentence itself stays a plain string in copy.ts, so the words are still
 * in one place; this only turns the address inside it into a link.
 */
export default function MailtoText({ text, className }: { text: string; className?: string }) {
  const address = CONTACT;
  const parts = text.split(address);
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <a
              href={`mailto:${address}`}
              {...hint(address, HINT.mail)}
              className={
                className ?? "text-brand-teal underline decoration-brand-teal/40 underline-offset-4"
              }
            >
              {address}
            </a>
          )}
        </span>
      ))}
    </>
  );
}
