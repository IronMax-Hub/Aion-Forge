// Keeps the phone's screen on while asked to (owner decision M-C: during a life
// survey, which can take minutes on a phone). The work is done by the KeepAwake
// plugin in the Android app (android/.../KeepAwakePlugin.java); in a browser
// there is no such plugin and this does nothing.

import { Capacitor, registerPlugin } from "@capacitor/core";

interface KeepAwakePlugin {
  keepAwake(): Promise<void>;
  allowSleep(): Promise<void>;
}

const KeepAwake = registerPlugin<KeepAwakePlugin>("KeepAwake");

export function setKeepAwake(on: boolean): void {
  if (!Capacitor.isNativePlatform()) return;
  void (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep()).catch(() => { /* the screen may sleep; nothing else depends on it */ });
}
