// ── Carnot Research Developer Portal & Playground App Controller ──

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initThemeSwitcher();
  initNavigation();
  initCodeGenerators();
  initVoiceAgent();
  initTtsPlayground();
  initSttPlayground();
  initTranslatePlayground();
  initApiKeyManagement();
  initModelCatalogueFilters();
  loadSystemStatus();
});

// ── Authentication Controller (Static Login: carnot / Carnot@2026) ──
function initAuth() {
  const loginScreen = document.getElementById('loginScreen');
  const portalContainer = document.getElementById('portalContainer');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const btnLogout = document.getElementById('btnLogout');

  const isAuthenticated = sessionStorage.getItem('carnot_auth') === 'true';

  if (isAuthenticated) {
    loginScreen.classList.add('hidden');
    portalContainer.classList.remove('hidden');
  } else {
    loginScreen.classList.remove('hidden');
    portalContainer.classList.add('hidden');
  }

  function doLogin() {
    sessionStorage.setItem('carnot_auth', 'true');
    loginError.classList.add('hidden');
    loginScreen.classList.add('hidden');
    portalContainer.classList.remove('hidden');
    document.getElementById('userNameDisplay').textContent = 'carnot';
  }

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('loginUsername').value.trim().toLowerCase();
    const pass = document.getElementById('loginPassword').value.trim();

    if (user === 'carnot' && (pass === 'Carnot@2026' || pass === 'carnot@2026')) {
      doLogin();
    } else {
      loginError.classList.remove('hidden');
    }
  });

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      sessionStorage.removeItem('carnot_auth');
      loginScreen.classList.remove('hidden');
      portalContainer.classList.add('hidden');
      document.getElementById('loginUsername').value = '';
      document.getElementById('loginPassword').value = '';
      loginError.classList.add('hidden');
    });
  }
}

// ── Global State ──
let activeApiKey = 'cr_live_master_demo_key_778';
let activeCodeLang = { tts: 'js', stt: 'js', trans: 'js' };
let activeSttSource = 'mic'; // 'mic' or 'file'

// ── Theme Switcher (Light, Dark, Cyber) ──
function initThemeSwitcher() {
  const themeBtns = document.querySelectorAll('.theme-btn');
  const savedTheme = localStorage.getItem('carnot_theme') || 'light';
  setTheme(savedTheme);

  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-theme');
      setTheme(theme);
    });
  });
}

function setTheme(theme) {
  document.body.classList.remove('dark-theme', 'light-theme', 'cyber-theme');
  document.body.classList.add(`${theme}-theme`);

  document.querySelectorAll('.theme-btn').forEach(b => {
    if (b.getAttribute('data-theme') === theme) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  localStorage.setItem('carnot_theme', theme);
}

// ── Navigation & Mobile Drawer Controller ──
function initNavigation() {
  const menuItems = document.querySelectorAll('.menu-item');
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');

  function openSidebar() {
    sidebar.classList.add('open');
    sidebarBackdrop.classList.add('active');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarBackdrop.classList.remove('active');
  }

  if (sidebarToggle) sidebarToggle.addEventListener('click', openSidebar);
  if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);

  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = item.getAttribute('data-tab');
      switchTab(tabId);
      closeSidebar();
    });
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
  const activeMenu = document.querySelector(`.menu-item[data-tab="${tabId}"]`);
  if (activeMenu) activeMenu.classList.add('active');

  document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.add('hidden'));
  const targetPane = document.getElementById(`tab-${tabId}`);
  if (targetPane) targetPane.classList.remove('hidden');

  const titleMap = {
    overview: 'Platform Overview',
    'voice-agent': 'Realtime Voice Agent',
    'api-keys': 'API Keys Management',
    'model-catalogue': 'Model Catalogue',
    tts: 'Text to Speech Playground',
    stt: 'Speech to Text Playground',
    translate: 'Translation Playground',
    'api-status': 'Telemetry & System Status',
    documentation: 'API Reference & Documentation'
  };
  document.getElementById('pageTitle').textContent = titleMap[tabId] || 'Carnot Research Portal';
}

window.switchTab = switchTab;

// ── Universal Clipboard Copy Helper (HTTP + HTTPS Fallback) ──
function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  } else {
    return new Promise((resolve, reject) => {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-999999px';
        textarea.style.top = '-999999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (successful) resolve();
        else reject(new Error('execCommand copy failed'));
      } catch (err) {
        reject(err);
      }
    });
  }
}

// ── Model Catalogue Filtering ──
function initModelCatalogueFilters() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.getAttribute('data-filter');

      const cards = document.querySelectorAll('.model-card-lg');
      cards.forEach(card => {
        if (cat === 'all' || card.getAttribute('data-category') === cat) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
}

// ── Code Generators (JS, Python, cURL) ──
function initCodeGenerators() {
  document.querySelectorAll('.output-header-tabs').forEach(tabHeader => {
    tabHeader.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const parentPane = btn.closest('.playground-output');
        parentPane.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const view = btn.getAttribute('data-view');
        parentPane.querySelectorAll('.subview').forEach(sv => sv.classList.add('hidden'));
        
        if (view === 'code') {
          parentPane.querySelector('.subview[id$="-code-view"]').classList.remove('hidden');
        } else {
          parentPane.querySelector('.subview[id$="-result-view"]').classList.remove('hidden');
        }
      });
    });
  });

  document.querySelectorAll('.lang-selector').forEach(selector => {
    selector.querySelectorAll('.lang-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        selector.querySelectorAll('.lang-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        const lang = tab.getAttribute('data-lang');
        const parentId = selector.closest('.subview').id;
        
        if (parentId.startsWith('tts')) {
          activeCodeLang.tts = lang;
          updateTtsCodeSnippet();
        } else if (parentId.startsWith('stt')) {
          activeCodeLang.stt = lang;
          updateSttCodeSnippet();
        } else if (parentId.startsWith('trans')) {
          activeCodeLang.trans = lang;
          updateTranslateCodeSnippet();
        }
      });
    });
  });

  setupCopyBtn('btnCopyCode', 'tts-code-snippet');
  setupCopyBtn('btnCopySttCode', 'stt-code-snippet');
  setupCopyBtn('btnCopyTransCode', 'trans-code-snippet');
}

function setupCopyBtn(btnId, codeId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const codeElement = document.getElementById(codeId);
    if (!codeElement) return;
    const codeText = codeElement.innerText;
    copyToClipboard(codeText).then(() => {
      const origHtml = btn.innerHTML;
      btn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
      setTimeout(() => btn.innerHTML = origHtml, 2000);
    }).catch(err => {
      console.error('Copy failed:', err);
    });
  });
}

// ── Text to Speech (TTS) Controller ──
function initTtsPlayground() {
  const inputTxt = document.getElementById('tts-input');
  const charNum = document.getElementById('tts-char-num');
  const paceInput = document.getElementById('tts-pace');
  const paceVal = document.getElementById('tts-pace-val');

  inputTxt.addEventListener('input', () => {
    charNum.textContent = inputTxt.value.length;
    updateTtsCodeSnippet();
  });

  paceInput.addEventListener('input', () => {
    paceVal.textContent = parseFloat(paceInput.value).toFixed(2) + 'x';
    updateTtsCodeSnippet();
  });

  ['tts-voice', 'tts-lang', 'tts-samplerate', 'tts-type', 'tts-model'].forEach(id => {
    document.getElementById(id).addEventListener('change', updateTtsCodeSnippet);
  });

  updateTtsCodeSnippet();
  document.getElementById('btnRunTts').addEventListener('click', runTtsSynthesis);
}

function updateTtsCodeSnippet() {
  const text = document.getElementById('tts-input').value;
  const model = document.getElementById('tts-model').value;
  const voice = document.getElementById('tts-voice').value;
  const lang = document.getElementById('tts-lang').value;
  const pace = document.getElementById('tts-pace').value;
  const sampleRate = document.getElementById('tts-samplerate').value;
  const key = activeApiKey;
  const host = window.location.origin;

  const langType = activeCodeLang.tts;
  let code = '';

  if (langType === 'js') {
    code = `// Carnot Research Text-to-Speech API Request (JavaScript / Node.js)
const response = await fetch('${host}/v1/tts/generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${key}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    text: ${JSON.stringify(text)},
    model: '${model}',
    target_language: '${lang}',
    voice: '${voice}',
    pace: ${pace},
    sample_rate: ${sampleRate}
  })
});

const data = await response.json();
console.log('Audio Base64:', data.audio_b64);
console.log('Latency:', data.latency_ms, 'ms');`;
  } else if (langType === 'python') {
    code = `# Carnot Research Text-to-Speech API Request (Python)
import requests

url = "${host}/v1/tts/generate"
headers = {
    "Authorization": "Bearer ${key}",
    "Content-Type": "application/json"
}
payload = {
    "text": ${JSON.stringify(text)},
    "model": "${model}",
    "target_language": "${lang}",
    "voice": "${voice}",
    "pace": ${pace},
    "sample_rate": ${sampleRate}
}

response = requests.post(url, headers=headers, json=payload)
data = response.json()
print("Latency:", data.get("latency_ms"), "ms")`;
  } else {
    code = `# Carnot Research Text-to-Speech API Request (cURL)
curl -X POST "${host}/v1/tts/generate" \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": ${JSON.stringify(text)},
    "model": "${model}",
    "target_language": "${lang}",
    "voice": "${voice}",
    "pace": ${pace},
    "sample_rate": ${sampleRate}
  }'`;
  }

  document.getElementById('tts-code-snippet').textContent = code;
}

async function runTtsSynthesis() {
  const btn = document.getElementById('btnRunTts');
  const origBtnText = btn.innerHTML;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Synthesizing...`;
  btn.disabled = true;

  switchToOutputTab('tab-tts');

  const text = document.getElementById('tts-input').value;
  const model = document.getElementById('tts-model').value;
  const voice = document.getElementById('tts-voice').value;
  const lang = document.getElementById('tts-lang').value;
  const pace = document.getElementById('tts-pace').value;
  const sampleRate = document.getElementById('tts-samplerate').value;

  try {
    const response = await fetch('/v1/tts/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${activeApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model,
        target_language: lang,
        voice,
        pace: parseFloat(pace),
        sample_rate: parseInt(sampleRate)
      })
    });

    const data = await response.json();
    btn.innerHTML = origBtnText;
    btn.disabled = false;

    if (data.audio_b64) {
      document.getElementById('tts-player-status').textContent = 'Synthesis Complete (' + model + ')';
      document.getElementById('tts-latency-tag').textContent = `${data.latency_ms} ms (GPU)`;

      const audioEl = document.getElementById('ttsAudioElement');
      audioEl.src = `data:audio/wav;base64,${data.audio_b64}`;
      audioEl.play();

      document.getElementById('tts-json-response').textContent = JSON.stringify({
        status: data.status,
        request_id: data.request_id,
        model: model,
        target_language: data.target_language,
        voice: data.voice,
        sample_rate: data.sample_rate,
        latency_ms: data.latency_ms
      }, null, 2);
    } else {
      document.getElementById('tts-player-status').textContent = 'Error: ' + (data.error || 'Failed');
      document.getElementById('tts-json-response').textContent = JSON.stringify(data, null, 2);
    }
  } catch (err) {
    btn.innerHTML = origBtnText;
    btn.disabled = false;
    alert('TTS Error: ' + err.message);
  }
}

// ── Speech to Text (STT) Controller ──
let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBlob = null;

function initSttPlayground() {
  const btnMic = document.getElementById('btnMicSource');
  const btnFile = document.getElementById('btnFileSource');
  const micBox = document.getElementById('micBox');
  const fileBox = document.getElementById('fileBox');
  const fileInput = document.getElementById('sttFileInput');

  btnMic.addEventListener('click', () => {
    activeSttSource = 'mic';
    btnMic.classList.add('active');
    btnFile.classList.remove('active');
    micBox.classList.remove('hidden');
    fileBox.classList.add('hidden');
    fileInput.value = '';
    document.getElementById('selectedFileName').textContent = '';
  });

  btnFile.addEventListener('click', () => {
    activeSttSource = 'file';
    btnFile.classList.add('active');
    btnMic.classList.remove('active');
    fileBox.classList.remove('hidden');
    micBox.classList.add('hidden');
    recordedAudioBlob = null;
    document.getElementById('recordTimer').textContent = '00:00';
  });

  fileBox.addEventListener('click', (e) => {
    if (e.target !== fileInput) {
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      document.getElementById('selectedFileName').textContent = 'Selected File: ' + e.target.files[0].name;
    }
  });

  document.getElementById('btnStartRecord').addEventListener('click', startRecording);
  document.getElementById('btnStopRecord').addEventListener('click', stopRecording);

  ['stt-lang', 'stt-mode', 'stt-type', 'stt-model'].forEach(id => {
    document.getElementById(id).addEventListener('change', updateSttCodeSnippet);
  });

  updateSttCodeSnippet();
  document.getElementById('btnRunStt').addEventListener('click', runSttTranscription);
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    let options = {};
    if (typeof MediaRecorder.isTypeSupported === 'function') {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options.mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        options.mimeType = 'audio/ogg';
      }
    }

    mediaRecorder = new MediaRecorder(stream, options);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
      const recordedMime = mediaRecorder.mimeType || 'audio/webm';
      recordedAudioBlob = new Blob(audioChunks, { type: recordedMime });
      document.getElementById('recordTimer').textContent = 'Live recording captured!';
    };

    mediaRecorder.start();
    document.getElementById('btnStartRecord').classList.add('hidden');
    document.getElementById('btnStopRecord').classList.remove('hidden');
    document.getElementById('recordVisualizer').style.color = '#f43f5e';
    document.getElementById('recordTimer').textContent = 'Recording live...';
  } catch (err) {
    alert('Microphone access denied: ' + err.message);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    document.getElementById('btnStartRecord').classList.remove('hidden');
    document.getElementById('btnStopRecord').classList.add('hidden');
    document.getElementById('recordVisualizer').style.color = 'var(--accent-indigo)';
  }
}

function updateSttCodeSnippet() {
  const model = document.getElementById('stt-model').value;
  const lang = document.getElementById('stt-lang').value;
  const key = activeApiKey;
  const host = window.location.origin;
  const langType = activeCodeLang.stt;

  let code = '';
  if (langType === 'js') {
    code = `// Carnot Research Speech-to-Text API Request (JavaScript)
const formData = new FormData();
formData.append('file', audioFile);
formData.append('model', '${model}');
formData.append('language_code', '${lang}');

const response = await fetch('${host}/v1/stt/transcribe', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ${key}' },
  body: formData
});

const data = await response.json();
console.log('Transcript:', data.transcript);
console.log('GPU Latency:', data.latency_ms, 'ms');`;
  } else if (langType === 'python') {
    code = `# Carnot Research Speech-to-Text API Request (Python)
import requests

url = "${host}/v1/stt/transcribe"
headers = {"Authorization": "Bearer ${key}"}
files = {"file": open("sample.wav", "rb")}
data = {
    "model": "${model}",
    "language_code": "${lang}"
}

response = requests.post(url, headers=headers, files=files, data=data)
print("Transcript:", response.json().get("transcript"))`;
  } else {
    code = `# Carnot Research Speech-to-Text API Request (cURL)
curl -X POST "${host}/v1/stt/transcribe" \\
  -H "Authorization: Bearer ${key}" \\
  -F "file=@sample.wav" \\
  -F "model=${model}" \\
  -F "language_code=${lang}"`;
  }

  document.getElementById('stt-code-snippet').textContent = code;
}

async function runSttTranscription() {
  const btn = document.getElementById('btnRunStt');
  const origBtnText = btn.innerHTML;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Transcribing...`;
  btn.disabled = true;

  switchToOutputTab('tab-stt');

  const model = document.getElementById('stt-model').value;
  const lang = document.getElementById('stt-lang').value;
  const formData = new FormData();
  formData.append('model', model);
  formData.append('language_code', lang);

  const fileInput = document.getElementById('sttFileInput');

  if (activeSttSource === 'file') {
    if (fileInput.files.length > 0) {
      formData.append('file', fileInput.files[0]);
    } else {
      alert('Please browse and select an audio file to transcribe.');
      btn.innerHTML = origBtnText;
      btn.disabled = false;
      return;
    }
  } else {
    // Microphone Source Mode
    if (recordedAudioBlob) {
      const ext = recordedAudioBlob.type.includes('ogg') ? 'ogg' : 'webm';
      formData.append('file', recordedAudioBlob, `mic_recording.${ext}`);
    } else {
      const sampleBlob = createSampleAudioBlob();
      formData.append('file', sampleBlob, 'test_audio.wav');
    }
  }

  try {
    const response = await fetch('/v1/stt/transcribe', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${activeApiKey}` },
      body: formData
    });

    const data = await response.json();
    btn.innerHTML = origBtnText;
    btn.disabled = false;

    if (data.transcript !== undefined) {
      document.getElementById('stt-transcript-out').textContent = `"${data.transcript || 'Audio processed successfully.'}"`;
      document.getElementById('stt-latency-tag').textContent = `${data.latency_ms} ms (GPU)`;
      document.getElementById('stt-json-response').textContent = JSON.stringify({
        ...data,
        model: model
      }, null, 2);
    } else {
      document.getElementById('stt-transcript-out').textContent = 'Error: ' + (data.error || 'Transcription failed');
      document.getElementById('stt-json-response').textContent = JSON.stringify(data, null, 2);
    }
  } catch (err) {
    btn.innerHTML = origBtnText;
    btn.disabled = false;
    alert('STT Error: ' + err.message);
  }
}

function createSampleAudioBlob() {
  const sampleRate = 16000;
  const numSamples = sampleRate * 1;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.sin(2 * Math.PI * 440 * (i / sampleRate));
    view.setInt16(44 + i * 2, s * 16384, true);
  }
  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// ── Translation Controller ──
function initTranslatePlayground() {
  const inputTxt = document.getElementById('trans-input');
  inputTxt.addEventListener('input', updateTranslateCodeSnippet);
  ['trans-src', 'trans-tgt', 'trans-model'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateTranslateCodeSnippet);
  });

  updateTranslateCodeSnippet();
  document.getElementById('btnRunTranslate').addEventListener('click', runTranslation);
}

function updateTranslateCodeSnippet() {
  const text = document.getElementById('trans-input').value;
  const src = document.getElementById('trans-src').value;
  const tgt = document.getElementById('trans-tgt').value;
  const modelEl = document.getElementById('trans-model');
  const model = modelEl ? modelEl.value : 'CR_trans';
  const key = activeApiKey;
  const host = window.location.origin;
  const langType = activeCodeLang.trans;

  let code = '';
  if (langType === 'js') {
    code = `// Carnot Research Translation API Request (JavaScript)
const response = await fetch('${host}/v1/translate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${key}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    text: ${JSON.stringify(text)},
    model: '${model}',
    source_language: '${src}',
    target_language: '${tgt}'
  })
});

const data = await response.json();
console.log('Translated Text:', data.translated_text);
console.log('GPU Latency:', data.latency_ms, 'ms');`;
  } else if (langType === 'python') {
    code = `# Carnot Research Translation API Request (Python)
import requests

url = "${host}/v1/translate"
headers = {
    "Authorization": "Bearer ${key}",
    "Content-Type": "application/json"
}
payload = {
    "text": ${JSON.stringify(text)},
    "model": "${model}",
    "source_language": "${src}",
    "target_language": "${tgt}"
}

response = requests.post(url, headers=headers, json=payload)
data = response.json()
print("Translated Text:", data.get("translated_text"))`;
  } else {
    code = `# Carnot Research Translation API Request (cURL)
curl -X POST "${host}/v1/translate" \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": ${JSON.stringify(text)},
    "model": "${model}",
    "source_language": "${src}",
    "target_language": "${tgt}"
  }'`;
  }

  document.getElementById('trans-code-snippet').textContent = code;
}

async function runTranslation() {
  const btn = document.getElementById('btnRunTranslate');
  const origBtnText = btn.innerHTML;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Translating...`;
  btn.disabled = true;

  switchToOutputTab('tab-translate');

  const text = document.getElementById('trans-input').value;
  const src = document.getElementById('trans-src').value;
  const tgt = document.getElementById('trans-tgt').value;
  const modelEl = document.getElementById('trans-model');
  const model = modelEl ? modelEl.value : 'CR_trans';

  try {
    const response = await fetch('/v1/translate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${activeApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model,
        source_language: src,
        target_language: tgt
      })
    });

    const data = await response.json();
    btn.innerHTML = origBtnText;
    btn.disabled = false;

    if (data.translated_text !== undefined) {
      document.getElementById('trans-output-text').textContent = `"${data.translated_text}"`;
      document.getElementById('trans-latency-tag').textContent = `${data.latency_ms} ms (GPU)`;
      document.getElementById('trans-json-response').textContent = JSON.stringify({
        ...data,
        model: model
      }, null, 2);
    } else {
      document.getElementById('trans-output-text').textContent = 'Error: ' + (data.error || 'Translation failed');
      document.getElementById('trans-json-response').textContent = JSON.stringify(data, null, 2);
    }
  } catch (err) {
    btn.innerHTML = origBtnText;
    btn.disabled = false;
    alert('Translation Error: ' + err.message);
  }
}

function switchToOutputTab(paneId) {
  const pane = document.getElementById(paneId);
  const headerTabs = pane.querySelectorAll('.output-header-tabs .tab-btn');
  headerTabs.forEach(b => b.classList.remove('active'));
  headerTabs[1].classList.add('active');

  pane.querySelectorAll('.subview').forEach(sv => sv.classList.add('hidden'));
  pane.querySelector('.subview[id$="-result-view"]').classList.remove('hidden');
}

// ── API Key Management ──
function initApiKeyManagement() {
  loadApiKeys();

  document.getElementById('btnCreateKey').addEventListener('click', () => {
    document.getElementById('keyModal').classList.remove('hidden');
  });

  document.getElementById('closeKeyModal').addEventListener('click', () => {
    document.getElementById('keyModal').classList.add('hidden');
  });

  document.getElementById('cancelKeyModal').addEventListener('click', () => {
    document.getElementById('keyModal').classList.add('hidden');
  });

  document.getElementById('confirmCreateKey').addEventListener('click', async () => {
    const name = document.getElementById('newKeyNameInput').value || 'Developer Key';
    const res = await fetch('/api/keys/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const newKey = await res.json();
    document.getElementById('keyModal').classList.add('hidden');
    document.getElementById('newKeyNameInput').value = '';
    loadApiKeys();
  });
}

async function loadApiKeys() {
  try {
    const res = await fetch('/api/keys');
    const keys = await res.json();
    
    const tbody = document.getElementById('apiKeysTableBody');
    const dropdown = document.getElementById('activeKeyDropdown');
    
    tbody.innerHTML = '';
    dropdown.innerHTML = '';

    keys.forEach((rec, idx) => {
      if (idx === 0) activeApiKey = rec.key;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${rec.name}</strong></td>
        <td><span class="key-code">${rec.key}</span></td>
        <td>${new Date(rec.created).toLocaleDateString()}</td>
        <td><span class="status-indicator"></span> ${rec.status} (${rec.requests} reqs)</td>
        <td>
          <button class="btn btn-outline" onclick="copyKey('${rec.key}')"><i class="fa-regular fa-copy"></i> Copy</button>
          <button class="btn btn-danger" onclick="revokeKey('${rec.key}')"><i class="fa-solid fa-trash"></i> Revoke</button>
        </td>
      `;
      tbody.appendChild(tr);

      const opt = document.createElement('option');
      opt.value = rec.key;
      opt.textContent = `${rec.name} (${rec.key.substring(0, 12)}...)`;
      dropdown.appendChild(opt);
    });

    dropdown.addEventListener('change', (e) => {
      activeApiKey = e.target.value;
      updateTtsCodeSnippet();
      updateSttCodeSnippet();
      updateTranslateCodeSnippet();
    });
  } catch (err) {
    console.error('Failed to load API keys:', err);
  }
}

window.copyKey = function(keyStr) {
  copyToClipboard(keyStr).then(() => {
    alert('API Key copied to clipboard!');
  }).catch(err => {
    alert('Copy failed: ' + err.message);
  });
};

window.revokeKey = async function(keyStr) {
  if (confirm('Are you sure you want to revoke this API Key?')) {
    await fetch('/api/keys/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: keyStr })
    });
    loadApiKeys();
  }
};

// ── System Status Telemetry ──
async function loadSystemStatus() {
  try {
    const res = await fetch('/api/status');
    const status = await res.json();
    console.log('System Status Telemetry:', status);
  } catch (e) {}
}

// ── Realtime Voice Agent Controller (ChatGPT / ElevenLabs Style) ──
let agentState = 'idle'; // 'idle', 'listening', 'thinking', 'speaking'
let agentMediaRecorder = null;
let agentAudioChunks = [];
let agentAudioContext = null;
let agentAnalyser = null;
let agentDataArray = null;
let agentCurrentAudio = null;
let agentConversationHistory = [
  {
    role: 'system',
    content: 'You are Carnot Voice AI, an intelligent, conversational, real-time voice agent. Always keep responses natural, friendly, spoken-friendly, and concise (1-3 sentences maximum) so they sound great when spoken out loud.'
  }
];

function initVoiceAgent() {
  const canvas = document.getElementById('voiceOrbCanvas');
  if (!canvas) return;

  const btnMicToggle = document.getElementById('btnAgentMicToggle');
  const btnSendText = document.getElementById('btnAgentSendText');
  const textInput = document.getElementById('agentTextInput');
  const btnReset = document.getElementById('btnAgentReset');

  // Start animated fluid glowing orb canvas loop
  startOrbAnimation(canvas);

  if (btnMicToggle) {
    btnMicToggle.addEventListener('click', () => {
      if (agentState === 'listening') {
        stopAgentListeningAndProcess();
      } else {
        startAgentListening();
      }
    });
  }

  if (btnSendText) {
    btnSendText.addEventListener('click', () => {
      const q = textInput.value.trim();
      if (q) {
        textInput.value = '';
        processAgentUserQuery(q);
      }
    });
  }

  if (textInput) {
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = textInput.value.trim();
        if (q) {
          textInput.value = '';
          processAgentUserQuery(q);
        }
      }
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      stopAgentSpeaking();
      agentConversationHistory = [
        {
          role: 'system',
          content: 'You are Carnot Voice AI, an intelligent, conversational, real-time voice agent. Always keep responses natural, friendly, spoken-friendly, and concise (1-3 sentences maximum).'
        }
      ];
      setAgentState('idle', 'Conversation reset. Tap mic to talk.');
      document.getElementById('userLiveText').textContent = '"Speak to start conversational voice agent..."';
      document.getElementById('aiLiveText').textContent = '"Conversation cleared. How can I help you next?"';
    });
  }
}

function setAgentState(state, statusMsg) {
  agentState = state;
  const indicator = document.getElementById('orbStatusIndicator');
  const statusText = document.getElementById('orbStatusText');
  const btnMic = document.getElementById('btnAgentMicToggle');
  const micIcon = document.getElementById('micIconMain');

  if (indicator) {
    indicator.className = 'orb-status-indicator ' + state;
  }
  if (statusText && statusMsg) {
    statusText.textContent = statusMsg;
  }

  if (btnMic && micIcon) {
    if (state === 'listening') {
      btnMic.classList.add('active');
      micIcon.className = 'fa-solid fa-stop';
    } else {
      btnMic.classList.remove('active');
      micIcon.className = 'fa-solid fa-microphone';
    }
  }
}

async function startAgentListening() {
  stopAgentSpeaking();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Setup Web Audio Analyser for live mic frequency visualizer
    if (!agentAudioContext) {
      agentAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (agentAudioContext.state === 'suspended') {
      await agentAudioContext.resume();
    }

    const source = agentAudioContext.createMediaStreamSource(stream);
    agentAnalyser = agentAudioContext.createAnalyser();
    agentAnalyser.fftSize = 64;
    source.connect(agentAnalyser);
    agentDataArray = new Uint8Array(agentAnalyser.frequencyBinCount);

    let options = {};
    if (typeof MediaRecorder.isTypeSupported === 'function') {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) options.mimeType = 'audio/webm;codecs=opus';
      else if (MediaRecorder.isTypeSupported('audio/webm')) options.mimeType = 'audio/webm';
      else if (MediaRecorder.isTypeSupported('audio/ogg')) options.mimeType = 'audio/ogg';
    }

    agentMediaRecorder = new MediaRecorder(stream, options);
    agentAudioChunks = [];

    agentMediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) agentAudioChunks.push(e.data);
    };

    agentMediaRecorder.start();
    setAgentState('listening', 'Listening to you... (Tap to finish)');
    document.getElementById('userLiveText').textContent = '"Listening..."';
  } catch (err) {
    console.warn('Microphone permission fallback:', err);
    // Fallback: Simulate sample query if mic not permitted
    const sampleQuery = prompt('Microphone not available in this browser context. Type your query for Carnot Voice AI:', 'Tell me about Carnot Research AI platform in 2 sentences.');
    if (sampleQuery) {
      processAgentUserQuery(sampleQuery);
    }
  }
}

async function stopAgentListeningAndProcess() {
  if (agentMediaRecorder && agentMediaRecorder.state !== 'inactive') {
    agentMediaRecorder.onstop = async () => {
      const mime = agentMediaRecorder.mimeType || 'audio/webm';
      const audioBlob = new Blob(agentAudioChunks, { type: mime });
      setAgentState('thinking', 'Transcribing & thinking (Qwen 3.5)...');
      document.getElementById('userLiveText').textContent = '"Processing audio..."';

      // Send to STT endpoint
      try {
        const lang = document.getElementById('agentLangSelect').value || 'hi-IN';
        const formData = new FormData();
        formData.append('model', 'CR_stt1');
        formData.append('language_code', lang);
        formData.append('file', audioBlob, 'mic_input.webm');

        const sttRes = await fetch('/v1/stt/transcribe', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${activeApiKey}` },
          body: formData
        });
        const sttData = await sttRes.json();
        const userText = (sttData.transcript || '').trim();

        if (userText) {
          processAgentUserQuery(userText);
        } else {
          setAgentState('idle', 'No speech detected. Tap mic to try again.');
          document.getElementById('userLiveText').textContent = '"(No speech detected)"';
        }
      } catch (err) {
        setAgentState('idle', 'STT Error: ' + err.message);
      }
    };

    agentMediaRecorder.stop();
  }
}

async function processAgentUserQuery(userText) {
  stopAgentSpeaking();
  document.getElementById('userLiveText').textContent = `"${userText}"`;
  document.getElementById('aiLiveText').textContent = 'Generating spoken response...';
  setAgentState('thinking', 'Qwen 3.5 is generating spoken response...');

  agentConversationHistory.push({ role: 'user', content: userText });

  try {
    const lang = document.getElementById('agentLangSelect').value || 'hi-IN';
    const voice = document.getElementById('agentVoiceSelect').value || 'CR_voice1';

    // Call LLM Chat Completions (Qwen 3.5)
    const llmRes = await fetch('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${activeApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen3.5:7b',
        messages: agentConversationHistory,
        temperature: 0.7,
        max_tokens: 250
      })
    });

    const llmData = await llmRes.json();
    const replyText = (llmData.message && llmData.message.content) ? llmData.message.content.trim() : 'I am here to assist you.';

    agentConversationHistory.push({ role: 'assistant', content: replyText });
    document.getElementById('aiLiveText').textContent = `"${replyText}"`;

    // Synthesize Speech via CR_voice1 TTS
    setAgentState('speaking', 'Carnot Voice AI is speaking...');

    const ttsRes = await fetch('/v1/tts/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${activeApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: replyText,
        model: voice,
        target_language: lang,
        voice: 'default',
        pace: 1.0,
        sample_rate: 44100
      })
    });

    const ttsData = await ttsRes.json();
    if (ttsData.audio_b64) {
      playAgentAudio(ttsData.audio_b64);
    } else {
      setAgentState('idle', 'Speech synthesis complete (Text-only)');
    }
  } catch (err) {
    setAgentState('idle', 'Error: ' + err.message);
    document.getElementById('aiLiveText').textContent = 'Error: ' + err.message;
  }
}

function playAgentAudio(audioBase64) {
  stopAgentSpeaking();

  const audio = new Audio(`data:audio/wav;base64,${audioBase64}`);
  agentCurrentAudio = audio;

  // Connect Web Audio Analyser to TTS playback for fluid orb pulsation
  try {
    if (!agentAudioContext) {
      agentAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const source = agentAudioContext.createMediaElementSource(audio);
    agentAnalyser = agentAudioContext.createAnalyser();
    agentAnalyser.fftSize = 64;
    source.connect(agentAnalyser);
    agentAnalyser.connect(agentAudioContext.destination);
    agentDataArray = new Uint8Array(agentAnalyser.frequencyBinCount);
  } catch (e) {}

  audio.onended = () => {
    setAgentState('idle', 'Conversation active. Tap mic to reply.');
  };

  audio.onerror = () => {
    setAgentState('idle', 'Audio playback finished.');
  };

  audio.play().catch(e => {
    setAgentState('idle', 'Tap mic to continue.');
  });
}

function stopAgentSpeaking() {
  if (agentCurrentAudio) {
    agentCurrentAudio.pause();
    agentCurrentAudio.currentTime = 0;
    agentCurrentAudio = null;
  }
}

// ── Animated Glowing Fluid Voice Orb Visualizer (Canvas 2D / Fluid Shader Effect) ──
function startOrbAnimation(canvas) {
  const ctx = canvas.getContext('2d');
  let angle = 0;

  function render() {
    requestAnimationFrame(render);

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Calculate audio energy level from Web Audio Analyser
    let audioEnergy = 0;
    if (agentAnalyser && agentDataArray) {
      agentAnalyser.getByteFrequencyData(agentDataArray);
      let sum = 0;
      for (let i = 0; i < agentDataArray.length; i++) {
        sum += agentDataArray[i];
      }
      audioEnergy = (sum / agentDataArray.length) / 255;
    }

    angle += 0.025;

    // Determine Base Color Palette based on agent state
    let col1, col2, col3, col4;
    let baseRadius = 80;
    let pulseAmount = Math.sin(angle * 1.5) * 4;

    if (agentState === 'listening') {
      // Vibrant Cyan & Neon Teal audio reaction
      col1 = '#00f2fe';
      col2 = '#4facfe';
      col3 = '#00f5a0';
      col4 = '#1e3a8a';
      baseRadius = 90 + (audioEnergy * 45);
      pulseAmount = Math.sin(angle * 4) * 8;
    } else if (agentState === 'thinking') {
      // Swirling Deep Violet & Purple
      col1 = '#a855f7';
      col2 = '#ec4899';
      col3 = '#6366f1';
      col4 = '#312e81';
      baseRadius = 85 + (Math.sin(angle * 3) * 6);
      pulseAmount = Math.cos(angle * 2) * 5;
    } else if (agentState === 'speaking') {
      // Dynamic Indigo, Electric Blue & Sky
      col1 = '#6366f1';
      col2 = '#38bdf8';
      col3 = '#818cf8';
      col4 = '#1e1b4b';
      baseRadius = 88 + (audioEnergy * 55);
      pulseAmount = Math.sin(angle * 3.5) * (6 + audioEnergy * 15);
    } else {
      // Idle: Gentle breathing floating celestial sphere
      col1 = '#6366f1';
      col2 = '#38bdf8';
      col3 = '#c084fc';
      col4 = '#0f172a';
      baseRadius = 78 + pulseAmount;
    }

    const currentRadius = Math.max(30, baseRadius);

    // Layer 1: Outer Soft Ambient Glow
    const outerGlow = ctx.createRadialGradient(centerX, centerY, currentRadius * 0.4, centerX, centerY, currentRadius * 1.55);
    outerGlow.addColorStop(0, hexToRgba(col2, 0.45));
    outerGlow.addColorStop(0.5, hexToRgba(col1, 0.2));
    outerGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(centerX, centerY, currentRadius * 1.55, 0, Math.PI * 2);
    ctx.fill();

    // Layer 2: Deforming Fluid Mesh Core Sphere
    ctx.save();
    ctx.beginPath();
    const numPoints = 64;
    for (let i = 0; i <= numPoints; i++) {
      const theta = (i / numPoints) * Math.PI * 2;
      // Perlin-like harmonic distortion
      const wave1 = Math.sin(theta * 3 + angle * 2) * (3 + audioEnergy * 12);
      const wave2 = Math.cos(theta * 5 - angle * 1.5) * (2 + audioEnergy * 8);
      const r = currentRadius + wave1 + wave2;
      const x = centerX + Math.cos(theta) * r;
      const y = centerY + Math.sin(theta) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // Fluid Internal Gradient
    const gradX = centerX + Math.cos(angle * 1.2) * (currentRadius * 0.35);
    const gradY = centerY + Math.sin(angle * 1.2) * (currentRadius * 0.35);
    const coreGrad = ctx.createRadialGradient(gradX, gradY, 10, centerX, centerY, currentRadius);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.2, col1);
    coreGrad.addColorStop(0.65, col2);
    coreGrad.addColorStop(1, col3);

    ctx.fillStyle = coreGrad;
    ctx.fill();
    ctx.restore();

    // Layer 3: Specular Highlight Sheen
    ctx.save();
    ctx.beginPath();
    const specX = centerX - currentRadius * 0.32;
    const specY = centerY - currentRadius * 0.32;
    const specGrad = ctx.createRadialGradient(specX, specY, 0, specX, specY, currentRadius * 0.6);
    specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
    specGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
    specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = specGrad;
    ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function hexToRgba(hex, alpha) {
    if (!hex.startsWith('#')) return hex;
    const r = parseInt(hex.slice(1, 3), 16) || 99;
    const g = parseInt(hex.slice(3, 5), 16) || 102;
    const b = parseInt(hex.slice(5, 7), 16) || 241;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  render();
}

