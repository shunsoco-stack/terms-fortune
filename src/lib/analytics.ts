import { track } from "@vercel/analytics";

export function trackFortuneEvent(
  name: "fortune_draw" | "image_save" | "share",
  properties: Record<string, string | number | boolean>,
  sample = false,
) {
  if (sample) return;
  try {
    // Only non-personal operational properties; never send the local history.
    track(name, properties);
  } catch {
    // Analytics being unavailable must never interrupt a fortune or a share.
  }
}
