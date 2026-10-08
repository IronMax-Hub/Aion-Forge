// Capacitor wraps the built web app (dist/) in an Android app for sideloading
// onto a phone. See Documents/Mobile-APK.md.
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.aionforge.app',
  appName: 'Aion Forge',
  webDir: 'dist',
}

export default config
