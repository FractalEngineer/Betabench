export type Pad = {
  label: string;
  resource: string;
  index: number;
  pin: string;
};

export function gpioPin(value: string) {
  const match = value
    .trim()
    .toUpperCase()
    .match(/^P?([A-K])(\d{1,2})$/);
  if (!match || Number(match[2]) > 15)
    throw Error("Enter GPIO pins such as A00 and A01");
  return `${match[1]}${match[2].padStart(2, "0")}`;
}

// Accept resource output or a full dump. Later assignments, including NONE,
// replace earlier values; commented defaults must never become assignments.
export function resourcePads(text: string): Pad[] {
  const assignments = new Map<string, Pad>();
  for (const line of text.split("\n")) {
    const match = line
      .trim()
      .match(/^resource\s+(\w+)\s+(\d+)\s+(NONE|P?[A-K]\d{1,2})$/i);
    if (!match) continue;
    const resource = match[1].toUpperCase();
    const index = Number(match[2]);
    const label = `${resource} ${index}`;
    if (match[3].toUpperCase() === "NONE") assignments.delete(label);
    else {
      try {
        assignments.set(label, {
          label,
          resource,
          index,
          pin: gpioPin(match[3]),
        });
      } catch {
        /* Ignore invalid pins in pasted output. */
      }
    }
  }
  return [...assignments.values()];
}

export function resourceCli(pads: Pad[], sck: Pad, dout: Pad) {
  const clockPin = gpioPin(sck.pin),
    dataPin = gpioPin(dout.pin);
  if (clockPin === dataPin) throw Error("Choose different GPIO pads");
  // GPIO remapping needs only resource commands. Removing a peripheral's pin
  // assignment frees that GPIO without changing its protocol or port settings.
  const release = pads
    .filter((p) => p.pin === clockPin || p.pin === dataPin)
    .map((p) => `resource ${p.resource} ${p.index} NONE`);
  return [
    ...new Set(release),
    `resource HX711_SCK 1 ${clockPin}`,
    `resource HX711_DOUT 1 ${dataPin}`,
    "save",
  ].join("\n");
}
