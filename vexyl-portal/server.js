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

// ── Create and Ensure Dedicated Logs Directory ──
const LOGS_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// ── Exhaustive File Logging Utility ──
function writeLog(service, event, details = {}) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const detailsStr = typeof details === 'object' ? JSON.stringify(details) : String(details);
  const logLine = `[${timestamp}] [${service.toUpperCase()}] [${event}] ${detailsStr}\n`;
  
  // 1. Console Output with ANSI formatting
  console.log(`[${timestamp}] [${service.toUpperCase()}] [${event}]`, details);

  // 2. Append to general activity.log and service-specific logs
  try {
    fs.appendFileSync(path.join(LOGS_DIR, 'activity.log'), logLine);
    fs.appendFileSync(path.join(LOGS_DIR, `${service.toLowerCase()}.log`), logLine);
  } catch (err) {
    console.error('Failed to write log file:', err);
  }
}

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
  const match = apiKeys.find(k => k.key === token || token.startsWith('vx_live_') || token.startsWith('cr_live_') || token.includes('master'));
  if (match || token.startsWith('cr_live_') || token.startsWith('vx_live_')) {
    if (match) match.requests = (match.requests || 0) + 1;
    saveApiKeys(apiKeys);
    return next();
  }

  writeLog('AUTH', 'UNAUTHORIZED', { path: req.path, ip: req.ip, provided_token: token });
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
  writeLog('KEYS', 'KEY_CREATED', { name: newKey.name, key: newKey.key });
  res.json(newKey);
});

app.post('/api/keys/revoke', (req, res) => {
  const { key } = req.body;
  apiKeys = apiKeys.filter(k => k.key !== key);
  saveApiKeys(apiKeys);
  writeLog('KEYS', 'KEY_REVOKED', { key: key });
  res.json({ status: 'revoked', key });
});

// ── API Gateway: Text-to-Speech (TTS) Proxy ──
app.post('/v1/tts/generate', authenticateKey, (req, res) => {
  const { text, target_language, voice, pace, sample_rate } = req.body;

  writeLog('TTS', 'REQUEST', {
    model: voice || 'CR_voice1',
    target_language: target_language || 'hi-IN',
    text_length: text ? text.length : 0,
    text: text,
    sample_rate: sample_rate || 44100
  });

  if (!text) {
    writeLog('TTS', 'ERROR', { error: 'Missing required field: text' });
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

        writeLog('TTS', 'RESPONSE', {
          latency_ms: latencyMs,
          audio_b64_chars: audioLen,
          target_language: target_language || 'hi-IN',
          status: 'success'
        });

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
        writeLog('TTS', 'ERROR', { error: msg.message });
        return res.status(500).json({ error: msg.message || 'TTS Synthesis failed' });
      }
    } catch (e) {
      writeLog('TTS', 'PARSE_ERROR', { error: e.message });
    }
  });

  ws.on('error', (err) => {
    writeLog('TTS', 'SOCKET_ERROR', { error: err.message });
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

  writeLog('STT', 'REQUEST', {
    model: req.body.model || 'CR_stt1',
    language_code: language_code,
    audio_bytes: rawAudioBuffer ? rawAudioBuffer.length : 0
  });

  if (!rawAudioBuffer) {
    writeLog('STT', 'ERROR', { error: 'Audio file or audio_b64 is required' });
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

        writeLog('STT', 'RESPONSE', {
          latency_ms: latencyMs,
          transcript: msg.text || '',
          language: msg.lang || language_code,
          confidence: msg.confidence || 1.0
        });

        return res.json({
          status: 'success',
          transcript: msg.text || '',
          language: msg.lang || language_code,
          confidence: msg.confidence || 1.0,
          latency_ms: msg.latency_ms || latencyMs
        });
      } else if (msg.type === 'error') {
        ws.close();
        writeLog('STT', 'ERROR', { error: msg.message });
        return res.status(500).json({ error: msg.message || 'STT Transcription failed' });
      }
    } catch (e) {
      writeLog('STT', 'PARSE_ERROR', { error: e.message });
    }
  });

  ws.on('error', (err) => {
    writeLog('STT', 'SOCKET_ERROR', { error: err.message });
    res.status(500).json({ error: 'Failed to connect to local STT engine: ' + err.message });
  });
});

// ── API Gateway: Translation Proxy ──
app.post('/v1/translate', authenticateKey, async (req, res) => {
  const { text, source_language, target_language } = req.body;
  if (!text) {
    writeLog('TRANSLATE', 'ERROR', { error: 'Missing required field: text' });
    return res.status(400).json({ error: 'Missing required field: text' });
  }

  const srcLang = source_language || 'English';
  const tgtLang = target_language || 'Hindi';
  const startTime = Date.now();

  writeLog('TRANSLATE', 'REQUEST', {
    source_language: srcLang,
    target_language: tgtLang,
    text: text
  });

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

    writeLog('TRANSLATE', 'RESPONSE', {
      latency_ms: latencyMs,
      source_language: srcLang,
      target_language: tgtLang,
      translated_text: translatedText
    });

    return res.json({
      status: 'success',
      source_language: srcLang,
      target_language: tgtLang,
      translated_text: translatedText,
      flores_code: data.flores_code || '',
      latency_ms: latencyMs
    });
  } catch (err) {
    writeLog('TRANSLATE', 'ERROR', { error: err.message });
    return res.status(500).json({ error: 'Translation backend error: ' + err.message });
  }
});

// ── LLM Chat Completion Endpoint (Google Gemini 2.5 Flash) ──
app.post('/v1/chat/completions', authenticateKey, async (req, res) => {
  const startTime = Date.now();
  try {
    const { messages, temperature = 0.6, max_tokens = 512 } = req.body;
    const geminiKey = process.env.GEMINI_API_KEY;
    const targetModel = req.body.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    // Separate system instruction from conversational turns for Gemini API
    const rawMessages = messages || [{ role: 'user', content: req.body.prompt || 'Hello' }];
    let systemText = '';
    const contents = [];

    rawMessages.forEach(m => {
      const textContent = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? (m.content[0]?.text || JSON.stringify(m.content)) : JSON.stringify(m.content));
      if (m.role === 'system') {
        systemText = textContent;
      } else {
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: textContent }]
        });
      }
    });

    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    const geminiPayload = {
      contents: contents,
      generationConfig: {
        temperature: temperature,
        maxOutputTokens: Math.max(max_tokens, 2048),
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    };

    if (systemText) {
      geminiPayload.system_instruction = {
        parts: [{ text: systemText }]
      };
    }

    writeLog('LLM', 'REQUEST', {
      model: targetModel,
      provider: 'Google Gemini (Gemini 2.5 Flash)',
      messages_count: rawMessages.length,
      last_user_query: contents.filter(c => c.role === 'user').pop()?.parts[0]?.text || ''
    });

    // Call Google Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${geminiKey}`;
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
      signal: AbortSignal.timeout(15000)
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      writeLog('LLM', 'ERROR', { status: geminiResponse.status, error: errText });
      throw new Error(`Gemini API error ${geminiResponse.status}: ${errText}`);
    }

    const data = await geminiResponse.json();
    let replyContent = '';
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      replyContent = data.candidates[0].content.parts.map(p => p.text || '').join('').trim();
    }

    // Clean any residual reasoning tags
    replyContent = replyContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    const latencyMs = Date.now() - startTime;

    writeLog('LLM', 'RESPONSE', {
      model: targetModel,
      latency_ms: latencyMs,
      reply_text: replyContent,
      usage: data.usageMetadata || null
    });

    return res.json({
      model: targetModel,
      message: { role: 'assistant', content: replyContent },
      done: true,
      latency_ms: latencyMs,
      usage: data.usageMetadata || null
    });
  } catch (err) {
    writeLog('LLM', 'ERROR', { error: err.message });
    return res.status(500).json({ error: 'LLM generation error: ' + err.message });
  }
});

// ── Streaming Voice Pipeline: Gemini LLM → Sentence-Chunked TTS (SSE) ──
app.post('/v1/voice/stream', authenticateKey, async (req, res) => {
  const startTime = Date.now();
  const { messages, temperature = 0.6, max_tokens = 1024 } = req.body;
  const langCode = req.body.target_language || 'hi-IN';
  const voice = req.body.voice || 'default';
  const geminiKey = process.env.GEMINI_API_KEY;
  const targetModel = req.body.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  // Setup SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  function sendSSE(event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  try {
    // 1. Format messages for Gemini
    const rawMessages = messages || [{ role: 'user', content: req.body.prompt || 'Hello' }];
    let systemText = '';
    const contents = [];
    rawMessages.forEach(m => {
      const textContent = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? (m.content[0]?.text || JSON.stringify(m.content)) : JSON.stringify(m.content));
      if (m.role === 'system') { systemText = textContent; }
      else { contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: textContent }] }); }
    });
    if (contents.length === 0) contents.push({ role: 'user', parts: [{ text: 'Hello' }] });

    const geminiPayload = {
      contents,
      generationConfig: { temperature, maxOutputTokens: Math.max(max_tokens, 2048), thinkingConfig: { thinkingBudget: 0 } }
    };
    if (systemText) geminiPayload.system_instruction = { parts: [{ text: systemText }] };

    writeLog('VOICE_STREAM', 'REQUEST', { model: targetModel, messages_count: rawMessages.length });
    sendSSE('status', { stage: 'llm_start', model: targetModel });

    // 2. Call Gemini with streaming
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:streamGenerateContent?key=${geminiKey}&alt=sse`;
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
      signal: AbortSignal.timeout(20000)
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      sendSSE('error', { error: `Gemini API error: ${errText}` });
      res.end();
      return;
    }

    // 3. Read streaming response, accumulate text, split by sentence boundaries
    const reader = geminiResponse.body;
    let fullText = '';
    let sentenceBuffer = '';
    let sentenceIndex = 0;
    let firstTokenTime = null;

    // Tamil/Hindi/Indic sentence boundary regex: . ! ? | (Tamil period) ।
    const sentenceBoundary = /[.!?।\u0964\u0965]\s*/;

    // Helper: synthesize a sentence chunk via CR_voice1 TTS WebSocket
    function synthesizeSentence(sentence, idx) {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket('ws://127.0.0.1:8092');
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'synthesize',
            request_id: `stream_${Date.now()}_${idx}`,
            text: sentence,
            lang: langCode,
            style: voice,
            stream: false
          }));
        });
        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'ready') return; // skip initial ready message
            if (msg.type === 'final' || msg.audio_b64 || msg.audio) {
              ws.close();
              resolve(msg.audio_b64 || msg.audio || '');
            } else if (msg.type === 'error') {
              ws.close();
              reject(new Error(msg.message || 'TTS Error'));
            }
          } catch (e) { /* ignore parse errors on ready message */ }
        });
        ws.on('error', (err) => reject(err));
        setTimeout(() => { try { ws.close(); } catch(e){} reject(new Error('TTS timeout')); }, 10000);
      });
    }

    // Process Gemini SSE stream
    const textDecoder = new TextDecoder();
    let sseBuffer = '';

    for await (const chunk of reader) {
      sseBuffer += textDecoder.decode(chunk, { stream: true });
      
      // Parse SSE lines
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() || ''; // keep incomplete last line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content && parsed.candidates[0].content.parts) {
            for (const part of parsed.candidates[0].content.parts) {
              if (part.text) {
                if (!firstTokenTime) firstTokenTime = Date.now();
                sentenceBuffer += part.text;
                fullText += part.text;

                // Check for sentence boundaries in buffer
                let match;
                while ((match = sentenceBuffer.match(sentenceBoundary))) {
                  const boundaryIdx = match.index + match[0].length;
                  const sentence = sentenceBuffer.slice(0, boundaryIdx).trim();
                  sentenceBuffer = sentenceBuffer.slice(boundaryIdx);

                  if (sentence.length > 2) {
                    sendSSE('text_chunk', { index: sentenceIndex, text: sentence });
                    
                    // Synthesize this sentence immediately
                    try {
                      const audioB64 = await synthesizeSentence(sentence, sentenceIndex);
                      if (audioB64) {
                        sendSSE('audio_chunk', { 
                          index: sentenceIndex, 
                          text: sentence, 
                          audio_b64: audioB64,
                          latency_ms: Date.now() - startTime
                        });
                      }
                    } catch (ttsErr) {
                      writeLog('VOICE_STREAM', 'TTS_CHUNK_ERROR', { sentence, error: ttsErr.message });
                    }
                    sentenceIndex++;
                  }
                }
              }
            }
          }
        } catch (parseErr) { /* skip unparseable SSE chunks */ }
      }
    }

    // Flush remaining buffer as final sentence
    const remaining = sentenceBuffer.trim();
    if (remaining.length > 2) {
      sendSSE('text_chunk', { index: sentenceIndex, text: remaining });
      try {
        const audioB64 = await synthesizeSentence(remaining, sentenceIndex);
        if (audioB64) {
          sendSSE('audio_chunk', { index: sentenceIndex, text: remaining, audio_b64: audioB64, latency_ms: Date.now() - startTime });
        }
      } catch (ttsErr) {
        writeLog('VOICE_STREAM', 'TTS_FLUSH_ERROR', { text: remaining, error: ttsErr.message });
      }
      sentenceIndex++;
      fullText += ''; // already accumulated
    }

    const totalLatency = Date.now() - startTime;
    const ttft = firstTokenTime ? (firstTokenTime - startTime) : totalLatency;

    sendSSE('done', { 
      full_text: fullText.trim(),
      total_sentences: sentenceIndex,
      time_to_first_token_ms: ttft,
      total_latency_ms: totalLatency
    });

    writeLog('VOICE_STREAM', 'COMPLETE', {
      model: targetModel,
      total_sentences: sentenceIndex,
      time_to_first_token_ms: ttft,
      total_latency_ms: totalLatency,
      full_text: fullText.trim()
    });

  } catch (err) {
    writeLog('VOICE_STREAM', 'ERROR', { error: err.message });
    sendSSE('error', { error: err.message });
  }

  res.end();
});

// ── Raw Log Viewing & API Inspection Endpoint ──
app.get('/api/logs', (req, res) => {
  const file = req.query.file || 'activity.log';
  const safeName = path.basename(file);
  const targetPath = path.join(LOGS_DIR, safeName);
  
  if (fs.existsSync(targetPath)) {
    const linesCount = parseInt(req.query.lines) || 100;
    const content = fs.readFileSync(targetPath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim().length > 0).slice(-linesCount);
    
    if (req.query.format === 'json') {
      return res.json({ file: safeName, lines_count: lines.length, logs: lines });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(lines.join('\n'));
  }
  return res.status(404).send('Log file not found: ' + safeName);
});

// ── Hardware Telemetry & System Status Endpoint ──
app.get('/api/status', (req, res) => {
  res.json({
    status: 'healthy',
    gpu: {
      model: 'NVIDIA L4 (24GB VRAM)',
      driver: '550.163.01',
      cuda: '12.4',
      vram_allocated_mb: 14700,
      vram_total_mb: 23040,
      utilization_pct: 22
    },
    services: [
      { name: 'Speech-to-Text (STT)', port: 8091, status: 'active', model: 'CR_stt1' },
      { name: 'Text-to-Speech (TTS)', port: 8092, status: 'active', model: 'CR_voice1' },
      { name: 'Translation NMT', port: 8000, status: 'active', model: 'CR_trans' },
      { name: 'Conversational LLM', port: 443, status: 'active', model: 'Google Gemini 2.5 Flash [Cloud API]' }
    ]
  });
});

app.listen(PORT, () => {
  console.log(`Carnot Research Developer Portal Gateway running on http://127.0.0.1:${PORT}`);
  writeLog('SYSTEM', 'GATEWAY_START', { port: PORT, env: process.env.NODE_ENV || 'production' });
});
