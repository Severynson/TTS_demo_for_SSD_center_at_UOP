# SSD Center ElevenLabs TTS Demo

React + TypeScript frontend, FastAPI backend.

## 1) Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend reads `ELEVENLABS_API_KEY` from root `.env`.
Optional env vars:
- `ELEVENLABS_VOICE_ID`
- `ELEVENLABS_MODEL_ID`

## 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Behavior

- Select words in text block by dragging over text.
- Selection auto-starts TTS playback.
- `► play` turns into `❚❚ pause` during playback.
- `◼ stop` always visible, stops audio, clears selection.
- Clicking outside text block deselects and stops.
- Waveform fades in only during active/paused playback.
