# Camera Viewer

A web-based DVR camera viewer with live streaming and playback capabilities.

## Prerequisites

- Node.js 20+
- [go2rtc](https://github.com/AlexxIT/go2rtc) - for RTSP to WebRTC/MSE streaming

## Setup

```bash
npm install
```

## Running

### 1. Start go2rtc

```bash
cd go2rtc && ./go2rtc
```

### 2. Start the app

**Development** (with hot reload):
```bash
npm run dev
```

**Production**:
```bash
npm run build
npm start
```

### 3. Open the app

http://localhost:3002

## Configuration

Edit `config.json` to configure your XVR/DVR connection:

```json
{
  "xvr": {
    "host": "192.168.x.x",
    "port": 554,
    "username": "admin",
    "password": "password"
  }
}
```

Edit `go2rtc/go2rtc.yaml` to configure camera streams.

## Features

- Live view grid (1x1, 2x2, 3x3, 4x4 layouts)
- DVR playback with timeline navigation
- URL-based state persistence for playback
- Desktop: MSE/WebSocket streaming (low latency)
- Mobile: MP4 progressive streaming (iOS compatible)
