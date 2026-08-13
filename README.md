# Carnot Research — Speech & Translation AI Platform

An enterprise-grade, GPU-accelerated local AI platform for Indic Speech-to-Text (STT), Text-to-Speech (TTS), and Neural Machine Translation (IndicTrans2) running on NVIDIA L4 GPU hardware.

---

## 🚀 Features

- **Text-to-Speech (TTS)**: Multi-speaker 44.1kHz neural voice synthesis (`CR_voice1`, `CR_voice2`, `CR_voice3`).
- **Speech-to-Text (STT)**: Streaming Conformer speech recognition with VAD silence filtering (`CR_stt1`, `CR_stt2`, `CR_stt3`).
- **Neural Machine Translation**: Sub-200ms English ↔ 22 Indic Languages neural translation (`CR_trans`).
- **Developer Gateway & Playground**: Interactive web dashboard, API key management, live telemetry metrics, and multi-language code generators (JavaScript, Python, cURL).
- **Postman Collection**: Included API collection (`Carnot_Research_API.postman_collection.json`).
- **PM2 Supervision**: Automated process supervisor config (`ecosystem.config.js`).

---

## 🛠️ Quick Start

### 1. Install & Supervise Microservices via PM2
```bash
cd /home/gcpuser/STT-TTS
pm2 start ecosystem.config.js
pm2 save
```

### 2. Check Live Status
```bash
pm2 status
```

---

## 🌐 Endpoints

- **Web Gateway Portal**: `http://localhost:3000`
- **Speech-to-Text (STT WebSocket)**: `ws://localhost:8091`
- **Text-to-Speech (TTS WebSocket)**: `ws://localhost:8092`
- **Translation Endpoint**: `http://localhost:8000`
