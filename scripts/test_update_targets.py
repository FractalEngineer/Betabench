import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("targets", Path(__file__).with_name("update-targets.py"))
targets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(targets)


class TargetResourcesTest(unittest.TestCase):
    def test_resource_names_and_ordinals(self):
        for macro, expected in {
            "UART0_TX_PIN": ("SERIAL_TX", 0, "TX0"),
            "SOFTSERIAL1_RX_PIN": ("SOFTSERIAL_RX", 1, "SOFTSERIAL1_RX"),
            "LPUART1_TX_PIN": ("LPUART_TX", 1, "LPUART1_TX"),
            "PIOUART0_RX_PIN": ("PIOUART_RX", 0, "PIOUART0_RX"),
            "MOTOR5_PIN": ("MOTOR", 5, "M5"),
            "SERVO2_PIN": ("SERVO", 2, "SERVO2"),
            "LED0_PIN": ("LED", 1, "LED1"),
            "PINIO1_PIN": ("PINIO", 1, "PINIO1"),
            "RX_PWM2_PIN": ("PWM", 2, "PWM2"),
            "INVERTER_PIN_UART4": ("INVERTER", 4, "INVERTER4"),
            "GYRO_2_CS_PIN": ("GYRO_CS", 2, "GYRO2_CS"),
            "SPI1_SDI_PIN": ("SPI_SDI", 1, "SPI1_SDI"),
            "I2C2_SDA_PIN": ("I2C_SDA", 2, "I2C2_SDA"),
            "ADC_VBAT_PIN": ("ADC_BATT", 1, "ADC_BATT"),
            "RX_PPM_PIN": ("PPM", 1, "PPM"),
        }.items():
            with self.subTest(macro=macro):
                self.assertEqual(targets.resource_for_macro(macro), expected)

    def test_gpio_aliases_are_kept(self):
        pads = targets.config_pads("#define MOTOR5_PIN PB8\n#define LED_STRIP_PIN PB8\n#define BEEPER_PIN PA0\n#define PINIO1_PIN PA14")
        self.assertEqual([(p["resource"], p["pin"]) for p in pads], [
            ("MOTOR", "B08"), ("LED_STRIP", "B08"), ("BEEPER", "A00"), ("PINIO", "A14"),
        ])

    def test_only_known_cli_resources_are_emitted(self):
        self.assertEqual(targets.config_pads("#define MADE_UP_PIN PA0\n// #define MOTOR1_PIN PA1\n#define MOTOR1_PIN NONE\n#define PINIO1_PIN PA99"), [])

    def test_conflicting_resource_definitions_are_not_silently_guessed(self):
        with self.assertRaisesRegex(ValueError, "Ambiguous resource"):
            targets.config_pads("#define MOTOR1_PIN PA0\n#define MOTOR1_PIN PA1")


if __name__ == "__main__":
    unittest.main()
