# LyricsNow for Flexbar

LyricsNow is a Flexbar plugin for Spotify playback control and real-time lyric display.

![LyricsNow1](resources/flexbar-lyricsnow1.png)
![LyricsNow2](resources/flexbar-lyricsnow2.png)


## Features

- `Now Playing` widget with album art, title, artist, album, and progress
- Dynamic lyric button with:
  - single-line / dual-line display
  - per-word highlight animation
  - translation line support
  - fallback to next line when translation is missing
  - click-to-toggle single-line and dual-line mode on device
- Spotify control buttons:
  - play / pause
  - like
  - shuffle
  - repeat
  - previous / next
- Customizable colors, typography, alignment, and backgrounds
- Optional album-art-based dynamic background rendering
- Chinese / Japanese / Korean font fallback for macOS and Windows

## Requirements

- FlexDesigner / Flexbar SDK environment
- A Flexbar device
- Node.js
- `flexcli`
- A Spotify application with:
  - `Client ID`
  - `Client Secret`



## Installation

### Option 1: Install packaged plugin

Build and pack:

```bash
npm install
npm run build
npm run plugin:pack
```

Then install the generated `com.jennergray.lyricsnow.flexplugin` in FlexDesigner.

### Option 2: Link for development

```bash
npm install
npm run dev
```

This will:

- unlink any existing local copy
- link the plugin into FlexDesigner
- watch source changes
- restart the plugin after rebuild
- open plugin debug output

## Spotify Setup

1. Create a Spotify app in the Spotify Developer Dashboard.
2. Copy your `Client ID` and `Client Secret`.
3. Open the plugin settings page in FlexDesigner.
4. Paste your Spotify credentials.
5. Start OAuth login from the plugin config page.

## Customization

### Now Playing

- background color
- secondary text color
- progress fill / track colors
- dynamic album color background

### Lyric

- single-line / dual-line mode
- translation on / off
- word highlight on / off
- background color
- primary / secondary alignment
- font sizes
- colors
- top offsets
- horizontal padding
- dynamic album color background

