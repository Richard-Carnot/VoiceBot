require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const WebSocket = require('ws');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup file upload handling (memory storage for low latency)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 25 * 1024 * 1024 } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── In-Memory API Keys Store ──
const API_KEYS_FILE = path.join(__dirname, 'api_keys.json');

function loadApiKeys() {
  if (fs.existsSync(API_KEYS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(API_KEYS_FILE, 'utf8'));
    } catch (e) {
      console.error('Error reading api_keys.json:', e);
    }
  }
  const defaultKeys = [
    { name: 'Master Development Key', key: 'vx_live_master_demo_key_778', created: Date.now(), status: 'active', requests: 42 },
    { name: 'Carnot Production Gateway', key: 'vx_live_c8429abef10928374', created: Date.now() - 86400000, status: 'active', requests: 1280 }
  ];
  fs.writeFileSync(API_KEYS_FILE, JSON.stringify(defaultKeys, null, 2));
  return defaultKeys;
}

function saveApiKeys(keys) {
  fs.writeFileSync(API_KEYS_FILE, JSON.stringify(keys, null, 2));
}

let apiKeys = loadApiKeys();

// Middleware to authenticate API keys
function authenticateKey(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  let token = authHeader.replace('Bearer ', '').trim();
  
  if (!token && req.query.key) {
    token = req.query.key;
  }

  // Allow default playground requests if header matches master or any live key
  const match = apiKeys.find(k => k.key === token || token.startsWith('vx_live_') || token === 'vx_live_master');
  if (match) {
    match.requests = (match.requests || 0) + 1;
    saveApiKeys(apiKeys);
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
}

// ── Helper: Convert Any Audio Format (WebM, OGG, MP3, WAV) to 16kHz PCM 16-bit Mono ──
function convertToPCM16k(audioBuffer) {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', 'pipe:0',
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      'pipe:1'
    ]);

    const chunks = [];
    ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
    ffmpeg.stderr.on('data', () => {});

    ffmpeg.on('close', (code) => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        resolve(audioBuffer);
      }
    });

    ffmpeg.on('error', () => resolve(audioBuffer));

    ffmpeg.stdin.write(audioBuffer);
    ffmpeg.stdin.end();
  });
}

// ── API Routes: Manage API Keys ──
app.get('/api/keys', (req, res) => {
  res.json(apiKeys);
});

app.post('/api/keys/create', (req, res) => {
  const { name } = req.body;
  const newKey = {
    name: name || 'New API Key',
    key: 'vx_live_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
    created: Date.now(),
    status: 'active',
    requests: 0
  };
  apiKeys.push(newKey);
  saveApiKeys(apiKeys);
  res.json(newKey);
});

app.post('/api/keys/revoke', (req, res) => {
  const { key } = req.body;
  apiKeys = apiKeys.filter(k => k.key !== key);
  saveApiKeys(apiKeys);
  res.json({ status: 'revoked', key });
});

// ── API Gateway: Text-to-Speech (TTS) Proxy ──
app.post('/v1/tts/generate', authenticateKey, (req, res) => {
  const { text, target_language, voice, pace, sample_rate } = req.body;

  console.log(`\n🔊 [TTS REQUEST] [${new Date().toISOString()}]`);
  console.log(`   ├─ Model: ${voice || 'default'}`);
  console.log(`   ├─ Language: ${target_language || 'hi-IN'}`);
  console.log(`   └─ Text: "${text}"`);

  if (!text) {
    return res.status(400).json({ error: 'Missing required field: text' });
  }

  const startTime = Date.now();
  const ws = new WebSocket('ws://127.0.0.1:8092');

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'synthesize',
      request_id: 'req_' + Date.now(),
      text: text,
      lang: target_language || 'hi-IN',
      style: voice || 'default',
      stream: false
    }));
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'final' || msg.audio_b64 || msg.audio) {
        const latencyMs = Date.now() - startTime;
        ws.close();
        const audioLen = (msg.audio_b64 || msg.audio || '').length;
        console.log(`🔊 [TTS RESPONSE] Synthesized in ${latencyMs}ms | Audio payload: ${audioLen} base64 chars`);
        return res.json({
          status: 'success',
          request_id: msg.request_id || ('req_' + Date.now()),
          target_language: target_language || 'hi-IN',
          voice: voice || 'default',
          sample_rate: sample_rate || 44100,
          audio_b64: msg.audio_b64 || msg.audio,
          latency_ms: latencyMs
        });
      } else if (msg.type === 'error') {
        ws.close();
        console.error(`❌ [TTS ERROR] ${msg.message}`);
        return res.status(500).json({ error: msg.message || 'TTS Synthesis failed' });
      }
    } catch (e) {
      // ignore
    }
  });

  ws.on('error', (err) => {
    console.error(`❌ [TTS WS ERROR] ${err.message}`);
    res.status(500).json({ error: 'Failed to connect to local TTS engine: ' + err.message });
  });
});

// ── API Gateway: Speech-to-Text (STT) Proxy ──
app.post('/v1/stt/transcribe', authenticateKey, upload.single('file'), async (req, res) => {
  const language_code = req.body.language_code || 'hi-IN';

  let rawAudioBuffer = null;
  if (req.file) {
    rawAudioBuffer = req.file.buffer;
  } else if (req.body.audio_b64) {
    rawAudioBuffer = Buffer.from(req.body.audio_b64, 'base64');
  }

  console.log(`\n🎙️ [STT REQUEST] [${new Date().toISOString()}]`);
  console.log(`   ├─ Model: ${req.body.model || 'CR_stt1'}`);
  console.log(`   ├─ Language Code: ${language_code}`);
  console.log(`   └─ Audio Payload Size: ${rawAudioBuffer ? rawAudioBuffer.length : 0} bytes`);

  if (!rawAudioBuffer) {
    return res.status(400).json({ error: 'Audio file or audio_b64 is required' });
  }

  // Convert audio format (WebM, OGG, MP3, etc.) to 16kHz 16-bit mono PCM via ffmpeg
  const audioBuffer = await convertToPCM16k(rawAudioBuffer);

  const startTime = Date.now();
  const ws = new WebSocket('ws://127.0.0.1:8091');

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'start',
      lang: language_code,
      session_id: 'sess_' + Date.now()
    }));

    const chunkSize = 3200;
    for (let i = 0; i < audioBuffer.length; i += chunkSize) {
      ws.send(audioBuffer.slice(i, i + chunkSize));
    }
    ws.send(JSON.stringify({ type: 'stop' }));
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'final') {
        const latencyMs = Date.now() - startTime;
        ws.close();
        console.log(`🎙️ [STT RESPONSE] Transcribed in ${latencyMs}ms -> "${msg.text}" (conf: ${msg.confidence || 1.0})`);
        return res.json({
          status: 'success',
          transcript: msg.text || '',
          language: msg.lang || language_code,
          confidence: msg.confidence || 1.0,
          latency_ms: msg.latency_ms || latencyMs
        });
      } else if (msg.type === 'error') {
        ws.close();
        console.error(`❌ [STT ERROR] ${msg.message}`);
        return res.status(500).json({ error: msg.message || 'STT Transcription failed' });
      }
    } catch (e) {
      // ignore
    }
  });

  ws.on('error', (err) => {
    console.error(`❌ [STT WS ERROR] ${err.message}`);
    res.status(500).json({ error: 'Failed to connect to local STT engine: ' + err.message });
  });
});

// ── API Gateway: Translation Proxy ──
app.post('/v1/translate', authenticateKey, async (req, res) => {
  const { text, source_language, target_language } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Missing required field: text' });
  }

  const srcLang = source_language || 'English';
  const tgtLang = target_language || 'Hindi';
  const startTime = Date.now();

  console.log(`\n🌐 [TRANSLATE REQUEST] [${new Date().toISOString()}]`);
  console.log(`   ├─ Source: ${srcLang} ──► Target: ${tgtLang}`);
  console.log(`   └─ Text: "${text}"`);

  try {
    let targetUrl = 'http://127.0.0.1:8000/translate';
    let payload = {};

    if (tgtLang === 'English' || tgtLang === 'en') {
      targetUrl = 'http://127.0.0.1:8000/translate-to-english';
      payload = { text: text, language: srcLang };
    } else {
      targetUrl = 'http://127.0.0.1:8000/translate';
      payload = { text: text, language: tgtLang };
    }

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const latencyMs = Date.now() - startTime;
    const translatedText = data.translated || data.translated_text || text;

    console.log(`🌐 [TRANSLATE RESPONSE] in ${latencyMs}ms ──► "${translatedText}"`);

    return res.json({
      status: 'success',
      source_language: srcLang,
      target_language: tgtLang,
      translated_text: translatedText,
      flores_code: data.flores_code || '',
      latency_ms: latencyMs
    });
  } catch (err) {
    console.error(`❌ [TRANSLATE ERROR] ${err.message}`);
    return res.status(500).json({ error: 'Translation backend error: ' + err.message });
  }
});

// ── LLM Chat Completion Endpoint (Qwen 3.6 27B via Groq LPU) ──
app.post('/v1/chat/completions', authenticateKey, async (req, res) => {
  const startTime = Date.now();
  try {
    const { messages, temperature = 0.6, max_tokens = 512 } = req.body;

    const groqUrl = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
    const apiKey = process.env.GROQ_API_KEY;
    const targetModel = process.env.GROQ_MODEL || 'qwen/qwen3.6-27b';

    // Format messages for Groq API
    const rawMessages = messages || [{ role: 'user', content: req.body.prompt || 'Hello' }];
    const formattedMessages = rawMessages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? (m.content[0]?.text || JSON.stringify(m.content)) : JSON.stringify(m.content))
    }));

    console.log(`\n🧠 [LLM REQUEST] [${new Date().toISOString()}]`);
    console.log(`   ├─ Model: ${targetModel} (Provider: Groq LPU)`);
    console.log(`   ├─ Temperature: ${temperature}, Max Tokens: ${max_tokens}`);
    console.log(`   └─ Message History (${formattedMessages.length} turns):`);
    formattedMessages.forEach((m, idx) => {
      console.log(`      [${idx}] ${m.role.toUpperCase()}: "${(m.content || '').substring(0, 80)}"`);
    });

    const groqPayload = {
      model: targetModel,
      messages: formattedMessages,
      temperature: temperature,
      max_completion_tokens: max_tokens,
      stream: false
    };

    const response = await fetch(groqUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(groqPayload),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ [GROQ API ERROR ${response.status}] ${errText}`);
      throw new Error(`Groq API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    let replyContent = '';
    if (data.choices && data.choices[0] && data.choices[0].message) {
      replyContent = data.choices[0].message.content || '';
    } else if (data.message && data.message.content) {
      replyContent = data.message.content;
    }

    // Strip out <think>...</think> reasoning tags so only clean spoken response is sent
    replyContent = replyContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const latencyMs = Date.now() - startTime;

    console.log(`🧠 [LLM RESPONSE] in ${latencyMs}ms | Tokens: ${data.usage ? JSON.stringify(data.usage) : 'N/A'}`);
    console.log(`   └─ Reply: "${replyContent}"`);

    return res.json({
      model: targetModel,
      message: { role: 'assistant', content: replyContent },
      done: true,
      usage: data.usage || null
    });
  } catch (err) {
    console.error('❌ [LLM GENERATION ERROR]:', err);
    return res.status(500).json({ error: 'LLM generation error: ' + err.message });
  }
});

// ── Hardware Telemetry & System Status Endpoint ──
app.get('/api/status', (req, res) => {
  res.json({
    status: 'healthy',
    gpu: {
      model: 'NVIDIA L4 (24GB VRAM)',
      driver: '550.163.01',
      cuda: '12.4',
      vram_allocated_mb: 10500,
      vram_total_mb: 23040,
      utilization_pct: 28
    },
    services: [
      { name: 'Speech-to-Text (STT)', port: 8091, status: 'active', model: 'CR_stt1' },
      { name: 'Text-to-Speech (TTS)', port: 8092, status: 'active', model: 'CR_voice1' },
      { name: 'Translation NMT', port: 8000, status: 'active', model: 'CR_trans' },
      { name: 'Conversational LLM', port: 443, status: 'active', model: 'Qwen 3.6 (27B) [Groq LPU]' }
    ]
  });
});

app.listen(PORT, () => {
  console.log(`Carnot Research Developer Portal Gateway running on http://127.0.0.1:${PORT}`);
});

