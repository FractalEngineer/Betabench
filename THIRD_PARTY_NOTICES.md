# Third-party notices

## dshot-esc-tester sequence

The MiniQuadTestBench preset is adapted from the sequence in Jye Smith's `dshot-esc-tester.ino`, commit `8695f27fb705892a0906acddc60b4a4e8dfb21a3`. Betabench starts the 28-second timeline at Run rather than device boot and makes the implicit near-full hold explicit.

Original notice, retained:

```text
----------------------------------------------------------------------------
"THE PROP-WARE LICENSE" (Revision 42):
<https://github.com/JyeSmith> wrote this file. As long as you retain this notice you
can do whatever you want with this stuff. If we meet some day, and you think
this stuff is worth it, you can buy me some props in return. Jye Smith
----------------------------------------------------------------------------
```

## Betaflight

Firmware source and patches are GPL-3.0-or-later, not covered by the web application's MIT license. Original source: https://github.com/betaflight/betaflight. Feature fork: https://github.com/FractalEngineer/betaflight/tree/HX711.

## Target mappings

The generated GPIO mapping snapshot comes from Betaflight/config at `0b73c1f29563e390b53c7f3ea631d26d6e969cde`: https://github.com/betaflight/config. The generator records pin/resource facts; full target configuration source is not included. Configurator theme colors follow the official Betaflight Configurator palette.
