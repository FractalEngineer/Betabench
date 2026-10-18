"""Snapshot UART, motor and LED pad mappings from a Betaflight config checkout."""
import json
import re
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1])
targets = []
for config in sorted((root / "configs").glob("*/*/config.h")):
    pads = []
    for name, bank, number in re.findall(
        r"^#define\s+(UART\d+_(?:TX|RX)|MOTOR\d+|LED_STRIP)_PIN\s+P([A-K])(\d+)\b",
        config.read_text(encoding="utf-8"), re.M
    ):
        uart = re.fullmatch(r"UART(\d+)_(TX|RX)", name)
        if uart:
            index, direction = uart.groups()
            resource, label = "SERIAL_" + direction, direction + index
        elif name.startswith("MOTOR"):
            index, resource, label = name[5:], "MOTOR", "M" + name[5:]
        else:
            index, resource, label = "1", "LED_STRIP", "LED_STRIP"
        pad = dict(label=label, resource=resource, index=int(index), pin=f"{bank}{int(number):02}")
        if not any(p["label"] == label for p in pads):
            pads.append(pad)
    if len({p["pin"] for p in pads}) >= 2:
        targets.append(dict(name=config.parent.name, pads=pads))
targets.sort(key=lambda t: t["name"])
assert len({t["name"] for t in targets}) == len(targets)
revision = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
Path("src/targets.json").write_text(json.dumps(dict(revision=revision, targets=targets), separators=(",", ":")) + "\n", encoding="utf-8")
print(f"Saved {len(targets)} targets from {revision}")
