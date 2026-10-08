# Aion Forge — Android app

The web app in `frontend/`, wrapped by [Capacitor](https://capacitorjs.com) as an Android app for installing on a phone directly (no Play Store). Plan and decisions: [Documents/Mobile-APK.md](../../Documents/Mobile-APK.md).

The phone build differs from the desktop one only in `frontend/.env.android`: saving is off, because there is no backend on the phone.

## Build

Needs, outside the repo:
- JDK 21, pointed to by `org.gradle.java.home` in `~/.gradle/gradle.properties`.
- The Android SDK (platform 36, build-tools 35.0.0, platform-tools), pointed to by `sdk.dir` in `android/local.properties` (not committed).

Install the SDK packages with Google's `android` command-line tool, which replaced `sdkmanager`. Installing accepts Google's SDK licence:

```bash
JAVA_HOME=~/Android/jdk-21 ~/Android/sdk/cmdline-tools/latest/bin/android --no-metrics --sdk=$HOME/Android/sdk sdk install platform-tools platforms/android-36 build-tools/35.0.0
```

Then, from `frontend/`:

```bash
npm run android
```

This type-checks, builds the web app in phone mode, copies it into the Android project and runs Gradle. The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`, signed with Gradle's debug key, which is enough for installing it yourself.

## Install on the phone (tested on HyperOS, Android 14)

1. Copy `app-debug.apk` to the phone and open it from the File Manager.
2. Allow "Install unknown apps" for the File Manager when asked. If a security scan warns about an unknown app, install anyway.
3. **Battery: App info → Battery saver → No restrictions.** HyperOS limits newly installed apps by default. That more than doubled the life survey's time (4:30 instead of 2:20 for seed 100000).

A new APK installs over the old one; settings such as the battery choice carry over.

## What to expect

- Landscape on either side, full screen; swipe from an edge to see the system bars.
- The back gesture steps back one level; with nothing left it leaves the app.
- The screen stays on while a life survey runs.
- Survey time, seed 100000, on a Snapdragon 7s Gen 3: about 2:20 for the first survey after the app opens, about 1:25 for later ones. The first takes longer while the workers warm up, and its progress can sit at 0% for about a minute. The elapsed seconds beside the progress show it's running.
