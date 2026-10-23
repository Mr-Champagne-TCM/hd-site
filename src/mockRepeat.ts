/**
 * THROWAWAY MOCK SWITCH (10/23, branch mock-repeat-1023, never merged):
 * `?mock=a` or `?mock=b` on a reading's page picks a version of the
 * "first try-this line twice" fix; anything else is today's page (AS IS).
 */
export type MockMode = "asis" | "a" | "b";

export function mockMode(): MockMode {
  if (typeof window === "undefined") return "asis";
  const m = new URLSearchParams(window.location.search).get("mock");
  return m === "a" || m === "b" ? m : "asis";
}
