# LOVE v2.0.6

## What's new

### In-app updates (Android)
- Automatic check for new versions on app startup
- Download and install updates directly from the app — no browser needed
- Beta channel support: enable in Settings → Updates to receive pre-release builds
- macOS: update button now links to GitHub Releases (auto-install not available without Apple certificate)

### Call notifications & stability
- Incoming calls now show a full-screen notification with Accept / Decline buttons, even when the app is in the background
- Missed call notifications with caller name
- Ongoing call notification with microphone toggle and end call button
- **Fixed:** leaving a DM screen no longer ends an active call — control the call from the notification
- **Fixed:** microphone mute button now works reliably on all Android devices (removed `Helper.setMicrophoneMute` that caused stuck mic state)

### Realtime & notifications
- Infinite reconnection attempts with exponential backoff — chat reconnects even after long network outages
- Network watchdog: auto-reconnect on network restore, app foreground, and tab focus
- **Fixed:** foreground-aware notification suppression — messages in the open chat no longer trigger redundant notifications
- Stacked DM notifications in the notification shade

### Settings
- Compact mode toggle for chat messages
- Per-category notification toggles (messages, mentions, hub, friends)
- App animations on/off toggle

### Landing page (loveapp.chat)
- Official product copy — clean, professional, no poetic filler
- Dynamic download links: version and URLs are fetched from GitHub Releases API, so buttons always point to the latest build
- RU/EN language switcher

### Version detection
- App version now reads from the actual APK build info (`package_info_plus`) instead of a hardcoded constant
- Prevents the "update available" prompt showing for the already-installed version

### Bug fixes
- Sound test now plays real audio tones and records/plays back microphone input
- Desktop: macOS auto-download disabled (unsigned builds cannot install silently)
- Desktop: "Download" button in Updates section now links to GitHub Releases
- Support form: file attachment removed to prevent 413 errors on Render
