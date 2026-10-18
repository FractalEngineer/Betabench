import { duration, evaluate } from "./profiles";
import type { Profile } from "./types";
let timer: ReturnType<typeof setInterval> | undefined;
self.onmessage = (event: MessageEvent<{ profile: Profile }>) => {
  clearInterval(timer);
  const profile = event.data.profile;
  const started = performance.now();
  let last = started;
  timer = setInterval(() => {
    const now = performance.now();
    if (now - last > 250) {
      clearInterval(timer);
      postMessage({
        type: "error",
        reason: "Throttle scheduler delayed more than 250 ms",
      });
      return;
    }
    last = now;
    const elapsed = now - started;
    if (elapsed >= duration(profile)) {
      clearInterval(timer);
      postMessage({ type: "complete" });
      return;
    }
    postMessage({
      type: "tick",
      time: performance.timeOrigin + now,
      elapsed,
      ...evaluate(profile, elapsed),
    });
  }, 20);
};
