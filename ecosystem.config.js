module.exports = {
  apps: [
    {
      name: 'carnot-portal',
      script: 'server.js',
      cwd: '/home/gcpuser/STT-TTS/vexyl-portal',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'carnot-stt',
      script: 'vexyl_stt_server.py',
      interpreter: '/home/gcpuser/STT-TTS/stt-tts/vexyl-stt/venv/bin/python3',
      cwd: '/home/gcpuser/STT-TTS/stt-tts/vexyl-stt',
      autorestart: true,
      watch: false
    },
    {
      name: 'carnot-tts',
      script: 'vexyl_tts_server.py',
      interpreter: '/home/gcpuser/STT-TTS/stt-tts/vexyl-tts/venv/bin/python3',
      cwd: '/home/gcpuser/STT-TTS/stt-tts/vexyl-tts',
      autorestart: true,
      watch: false
    },
    {
      name: 'carnot-translation',
      script: './venv/bin/uvicorn',
      args: 'server:app --host 127.0.0.1 --port 8000',
      interpreter: 'none',
      cwd: '/home/gcpuser/STT-TTS/translation',
      autorestart: true,
      watch: false
    }
  ]
};
