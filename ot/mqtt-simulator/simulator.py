"""
JSL Stainless Steel Plant — MQTT Sensor Simulator
Publishes 13 tags across 3 equipment units at 1Hz.
POST /inject-anomaly?equipment=CRM-1 to trigger a 30s anomaly window.
"""
import os, time, json, random, threading
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler

import paho.mqtt.client as mqtt

BROKER      = os.getenv("MQTT_BROKER", "localhost")
PORT        = int(os.getenv("MQTT_PORT", 1883))
RATE_HZ     = float(os.getenv("PUBLISH_RATE_HZ", 1))
SIGNAL_PORT = int(os.getenv("ANOMALY_SIGNAL_PORT", 8099))
TOPIC_BASE  = "jsl/plant/sensors"

# ── Equipment definitions ─────────────────────────────────────────────────────
EQUIPMENT = {
    "CRM-1": {
        "description": "Cold Rolling Mill #1",
        "line": "CR-LINE-1",
        "tags": {
            # std tightened to realistic PID-controlled process tolerances.
            # Anomaly offsets are 15-40x the std so injection creates Z≥15σ spikes.
            "bearing_temp_degC":  {"mean": 55.0,    "std": 0.8,  "unit": "degC", "anomaly": +22.0},
            "vibration_mm_s":     {"mean": 2.5,     "std": 0.12, "unit": "mm_s", "anomaly": +7.5},
            "motor_current_amp":  {"mean": 900.0,   "std": 8.0,  "unit": "amp",  "anomaly": +280.0},
            "rolling_force_kN":   {"mean": 10000.0, "std": 80.0, "unit": "kN",   "anomaly": +2200.0},
            "strip_speed_mpm":    {"mean": 148.0,   "std": 1.2,  "unit": "mpm",  "anomaly": 0.0},
        },
    },
    "APL-1": {
        "description": "Annealing & Pickling Line #1",
        "line": "APL-LINE-1",
        "tags": {
            "furnace_temp_degC":      {"mean": 1048.0, "std": 2.5,  "unit": "degC",  "anomaly": -60.0},
            "hno3_concentration_pct": {"mean": 20.0,   "std": 0.15, "unit": "pct",   "anomaly": -6.0},
            "strip_speed_mpm":        {"mean": 35.0,   "std": 0.5,  "unit": "mpm",   "anomaly": 0.0},
            "rinse_conductivity_us":  {"mean": 110.0,  "std": 4.0,  "unit": "us_cm", "anomaly": +400.0},
        },
    },
    "CCM-1": {
        "description": "Continuous Casting Machine #1",
        "line": "CAST-LINE-1",
        "tags": {
            "mold_level_mm":           {"mean": 110.0,  "std": 0.6,   "unit": "mm",   "anomaly": +18.0},
            "casting_speed_mpm":       {"mean": 1.10,   "std": 0.008, "unit": "mpm",  "anomaly": 0.0},
            "mold_cooling_delta_degC": {"mean": 11.5,   "std": 0.25,  "unit": "degC", "anomaly": +9.0},
            "tundish_temp_degC":       {"mean": 1545.0, "std": 1.5,   "unit": "degC", "anomaly": -25.0},
        },
    },
}

# Active anomaly set: equipment_id → expiry timestamp
anomalies: dict[str, float] = {}
anomaly_lock = threading.Lock()


class AnomalyHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path.startswith("/inject-anomaly"):
            from urllib.parse import urlparse, parse_qs
            qs = parse_qs(urlparse(self.path).query)
            equipment = qs.get("equipment", ["CRM-1"])[0]
            if equipment not in EQUIPMENT:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(f'{{"error": "unknown equipment {equipment}"}}'.encode())
                return
            with anomaly_lock:
                anomalies[equipment] = time.time() + 30  # 30-second anomaly window
            self.send_response(200)
            self.end_headers()
            self.wfile.write(
                json.dumps({"status": "injected", "equipment": equipment, "duration_s": 30}).encode()
            )
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args):
        pass


def is_anomaly_active(equipment_id: str) -> bool:
    with anomaly_lock:
        expiry = anomalies.get(equipment_id, 0)
        if time.time() < expiry:
            return True
        if equipment_id in anomalies:
            del anomalies[equipment_id]
        return False


def signal_server():
    HTTPServer(("0.0.0.0", SIGNAL_PORT), AnomalyHandler).serve_forever()


def publish_loop(client: mqtt.Client):
    interval = 1.0 / RATE_HZ
    while True:
        ts = datetime.now(timezone.utc).isoformat()
        for equipment_id, equip in EQUIPMENT.items():
            active = is_anomaly_active(equipment_id)
            for tag, cfg in equip["tags"].items():
                value = random.gauss(cfg["mean"], cfg["std"])
                if active and cfg["anomaly"] != 0.0:
                    value += cfg["anomaly"] * random.uniform(0.75, 1.0)
                payload = {
                    "equipment_id": equipment_id,
                    "equipment_desc": equip["description"],
                    "line_id": equip["line"],
                    "plant": "JSL1",
                    "tag": tag,
                    "value": round(value, 3),
                    "unit": cfg["unit"],
                    "timestamp": ts,
                    "anomaly_injected": active,
                }
                topic = f"{TOPIC_BASE}/{equipment_id}/{tag}"
                client.publish(topic, json.dumps(payload), qos=1)
        time.sleep(interval)


if __name__ == "__main__":
    threading.Thread(target=signal_server, daemon=True).start()
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.connect(BROKER, PORT, keepalive=60)
    client.loop_start()
    print(f"[Simulator] Publishing {sum(len(e['tags']) for e in EQUIPMENT.values())} tags "
          f"across {len(EQUIPMENT)} equipment units @ {RATE_HZ}Hz")
    publish_loop(client)
