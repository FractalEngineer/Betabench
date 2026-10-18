"""Snapshot CLI-remappable GPIO resources from a Betaflight config checkout.

Usage: python scripts/update-targets.py /path/to/betaflight/config
The generated revision/source paths let the UI use target defaults offline.
Only macros with known CLI resource counterparts are included; arbitrary
board-specific GPIO macros are not guessed into resource commands.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

# Resource names/ordinals follow Betaflight's CLI resource table and PG resets.
SINGLE = {
    "BEEPER_PIN": "BEEPER", "LED_STRIP_PIN": "LED_STRIP",
    "CAMERA_CONTROL_PIN": "CAMERA_CONTROL", "RX_PPM_PIN": "PPM",
    "ADC_VBAT_PIN": "ADC_BATT", "ADC_CURR_PIN": "ADC_CURR",
    "ADC_RSSI_PIN": "ADC_RSSI", "ADC_EXTERNAL1_PIN": "ADC_EXT",
    "SONAR_TRIGGER_PIN": "SONAR_TRIGGER", "SONAR_ECHO_PIN": "SONAR_ECHO",
    "ESCSERIAL_PIN": "ESCSERIAL", "TRANSPONDER_PIN": "TRANSPONDER",
    "SPEKTRUM_RX_BIND_PIN": "RX_BIND", "BINDPLUG_PIN": "RX_BIND_PLUG",
    "FLASH_CS_PIN": "FLASH_CS", "BARO_CS_PIN": "BARO_CS",
    "BARO_EOC_PIN": "BARO_EOC", "BARO_XCLR_PIN": "BARO_XCLR",
    "MAG_CS_PIN": "COMPASS_CS", "COMPASS_EXTI_PIN": "COMPASS_EXTI",
    "SDCARD_SPI_CS_PIN": "SDCARD_CS", "SDCARD_DETECT_PIN": "SDCARD_DETECT",
    "MAX7456_SPI_CS_PIN": "OSD_CS", "USB_DETECT_PIN": "USB_DETECT",
    "USB_MSC_BUTTON_PIN": "USB_MSC_PIN",
    "RX_SPI_CS_PIN": "RX_SPI_CS", "RX_SPI_EXTI_PIN": "RX_SPI_EXTI",
    "RX_SPI_BIND_PIN": "RX_SPI_BIND", "RX_SPI_LED_PIN": "RX_SPI_LED",
    "RX_SPI_CC2500_TX_EN_PIN": "RX_SPI_CC2500_TX_EN",
    "RX_SPI_CC2500_LNA_EN_PIN": "RX_SPI_CC2500_LNA_EN",
    "RX_SPI_CC2500_ANT_SEL_PIN": "RX_SPI_CC2500_ANT_SEL",
    "RX_SPI_EXPRESSLRS_RESET_PIN": "RX_SPI_EXPRESSLRS_RESET",
    "RX_SPI_EXPRESSLRS_BUSY_PIN": "RX_SPI_EXPRESSLRS_BUSY",
    "RX_EXPRESSLRS_SPI_RESET_PIN": "RX_SPI_EXPRESSLRS_RESET",
    "RX_EXPRESSLRS_SPI_BUSY_PIN": "RX_SPI_EXPRESSLRS_BUSY",
    "RX_CC2500_SPI_TX_EN_PIN": "RX_SPI_CC2500_TX_EN",
    "RX_CC2500_SPI_LNA_EN_PIN": "RX_SPI_CC2500_LNA_EN",
    "RX_CC2500_SPI_ANT_SEL_PIN": "RX_SPI_CC2500_ANT_SEL",
    "RTC6705_CS_PIN": "VTX_CS", "RTC6705_POWER_PIN": "VTX_POWER",
    "RTC6705_SPICLK_PIN": "VTX_CLK", "RTC6705_SPI_SDO_PIN": "VTX_DATA",
    **{f"SDIO_{signal}_PIN": f"SDIO_{signal}" for signal in ("CK", "CMD", "D0", "D1", "D2", "D3")},
}


def resource_for_macro(name):
    if name in SINGLE:
        resource = SINGLE[name]
        return resource, 1, resource
    match = re.fullmatch(r"(UART|SOFTSERIAL|LPUART|PIOUART)(\d+)_(TX|RX)_PIN", name)
    if match:
        kind, index, direction = match.groups()
        resource = ("SERIAL" if kind == "UART" else kind) + "_" + direction
        label = direction + index if kind == "UART" else f"{kind}{index}_{direction}"
        return resource, int(index), label
    match = re.fullmatch(r"(MOTOR|SERVO|PINIO|LED|RX_PWM)(\d+)_PIN", name)
    if match:
        kind, number = match.groups()
        index = int(number) + (1 if kind == "LED" else 0)
        resource = "PWM" if kind == "RX_PWM" else kind
        label = "M" + number if kind == "MOTOR" else f"{resource}{index}"
        return resource, index, label
    match = re.fullmatch(r"(SPI|I2C|CAN)(\d+)_(SCK|SDI|SDO|SCL|SDA|TX|RX|SILENT)_PIN", name)
    if match:
        bus, number, signal = match.groups()
        return f"{bus}_{signal}", int(number), f"{bus}{number}_{signal}"
    match = re.fullmatch(r"GYRO_(\d+)_(CS|EXTI|CLKIN)_PIN", name)
    if match:
        number, signal = match.groups()
        return f"GYRO_{signal}", int(number), f"GYRO{number}_{signal}"
    match = re.fullmatch(r"INVERTER_PIN_UART(\d+)", name)
    if match:
        return "INVERTER", int(match[1]), f"INVERTER{match[1]}"
    return None


def config_pads(text):
    pads = {}
    for name, bank, number in re.findall(r"^#define\s+(\w+)\s+P([A-K])(\d+)\b", text, re.M):
        mapping = resource_for_macro(name)
        if not mapping or int(number) > 15:
            continue
        resource, index, label = mapping
        pin = f"{bank}{int(number):02}"
        key = (resource, index)
        if key in pads and pads[key]["pin"] != pin:
            raise ValueError(f"Ambiguous resource {resource} {index}: {pads[key]['pin']} / {pin}")
        pads[key] = dict(label=label, resource=resource, index=index, pin=pin)
    return list(pads.values())


def main():
    root = Path(sys.argv[1])
    targets = []
    for config in sorted((root / "configs").glob("*/*/config.h")):
        pads = config_pads(config.read_text(encoding="utf-8"))
        if len({p["pin"] for p in pads}) >= 2:
            targets.append(dict(name=config.parent.name, source=config.relative_to(root).as_posix(), pads=pads))
    targets.sort(key=lambda t: t["name"])
    assert len({t["name"] for t in targets}) == len(targets)
    revision = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    Path("src/targets.json").write_text(json.dumps(dict(revision=revision, targets=targets), separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Saved {len(targets)} targets from {revision}")


if __name__ == "__main__":
    main()
