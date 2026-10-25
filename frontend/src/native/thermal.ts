// How hot the phone is, from Android (android/.../ThermalPlugin.java), so the
// black hole close-up can trace less finely before the phone runs hot. In a
// browser there is no such plugin and nothing is read.

import { Capacitor, registerPlugin } from "@capacitor/core";

export interface ThermalReading {
  /** Android's thermal status: 0 none … 6 shutdown, or -1 where Android cannot say. */
  status: number;
  /** How near the phone is to slowing itself down, 10 s ahead (1.0 = it would); absent where Android cannot say. */
  headroom?: number;
  batteryTempC?: number;
}

interface ThermalPlugin {
  getStatus(): Promise<ThermalReading>;
}

const Thermal = registerPlugin<ThermalPlugin>("Thermal");

/** The phone's heat now, or null in a browser or if Android does not answer. */
export async function readThermal(): Promise<ThermalReading | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try { return await Thermal.getStatus(); } catch { return null; }
}
