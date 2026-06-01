import { useEffect, useMemo, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";

type PlaybackState = "idle" | "loading" | "playing" | "paused";

const TEXT_BLOCKS = [
  "This demo was prepared for the SSD Center at the University of the Pacific to explore a modern text-to-speech option. ElevenLabs could be a promising complement to the current Kurzweil workflow, especially for more natural voice quality and flexible scaling.",
  "Pricing snapshot:",
  "•  Pay As You Go API: around $0.05 per 1,000 characters for Flash/Turbo models, and around $0.10 per 1,000 characters for Multilingual v2/v3 models.",
  "•  Scale plan: $299/month, includes 1.8M credits (about 30 hours of TTS), plus team collaboration and professional voice-cloning features.",
  "•  Business plan: $990/month, includes 6M credits (about 100 hours of TTS), plus low-latency TTS and expanded business features.",
  "•  Enterprise plan: custom, negotiable pricing for large organizations like universities, with scope tailored to institutional needs.",
  "Goal of this page is simple: select any part of this text, listen instantly, and evaluate whether this could be a strong option for SSD Center services.",
];

export function App() {
  const lines = useMemo(() => {
    let globalIndex = 0;
    return TEXT_BLOCKS.map((line) => {
      const isBullet = line.startsWith("• ");
      const words = line
        .replace(/^•\s*/, "")
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => {
          const token = { text: word, index: globalIndex };
          globalIndex += 1;
          return token;
        });
      return { isBullet, words };
    });
  }, []);
  const words = useMemo(
    () => lines.flatMap((line) => line.words.map((word) => word.text)),
    [lines],
  );
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [error, setError] = useState<string>("");
  const [speed, setSpeed] = useState<number>(1);

  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const waveContainerRef = useRef<HTMLDivElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const generatedBaseSpeedRef = useRef<number>(1);
  const manualPlaybackFactorRef = useRef<number>(1);
  const requestTokenRef = useRef(0);
  const textZoneRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);

  const range = useMemo(() => {
    if (selectionStart === null || selectionEnd === null) {
      return null;
    }
    return {
      start: Math.min(selectionStart, selectionEnd),
      end: Math.max(selectionStart, selectionEnd),
    };
  }, [selectionStart, selectionEnd]);

  const selectedText = useMemo(() => {
    if (!range) {
      return "";
    }
    return words.slice(range.start, range.end + 1).join(" ");
  }, [range, words]);

  const hasSelection = selectedText.length > 0;
  const canPlay = hasSelection && playbackState !== "loading";
  const canStop = playbackState !== "idle" || hasSelection;
  const showWaveform = playbackState === "playing" || playbackState === "paused";

  const stopAudio = (clearSelection: boolean) => {
    if (wavesurferRef.current) {
      wavesurferRef.current.stop();
      wavesurferRef.current.empty();
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPlaybackState("idle");
    if (clearSelection) {
      setSelectionStart(null);
      setSelectionEnd(null);
      setDragStart(null);
      setDragEnd(null);
    }
  };

  const updateSpeed = (next: number) => {
    setSpeed(() => {
      const rounded = Number(next.toFixed(1));
      const targetSpeed = Math.min(2, Math.max(0.5, rounded));
      const ws = wavesurferRef.current;

      if (ws) {
        const base = generatedBaseSpeedRef.current || 1;
        manualPlaybackFactorRef.current = targetSpeed / base;
        ws.setPlaybackRate(manualPlaybackFactorRef.current);
      }

      return targetSpeed;
    });
  };

  const synthesizeAndPlay = async (text: string) => {
    const token = ++requestTokenRef.current;
    stopAudio(false);
    setError("");
    setPlaybackState("loading");

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const blob = await response.blob();
      if (token !== requestTokenRef.current) {
        return;
      }

      if (!wavesurferRef.current) {
        throw new Error("Wave renderer not initialized");
      }

      const objectUrl = URL.createObjectURL(blob);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      objectUrlRef.current = objectUrl;

      await wavesurferRef.current.load(objectUrl);
      if (token !== requestTokenRef.current) {
        return;
      }
      generatedBaseSpeedRef.current = 1;
      manualPlaybackFactorRef.current = speed / generatedBaseSpeedRef.current;
      wavesurferRef.current.setPlaybackRate(manualPlaybackFactorRef.current);
      await wavesurferRef.current.play();

      setPlaybackState("playing");
    } catch (err) {
      setPlaybackState("idle");
      setError(err instanceof Error ? err.message : "TTS request failed");
    }
  };

  const handlePlayPause = async () => {
    if (!canPlay) {
      return;
    }

    if (playbackState === "playing") {
      wavesurferRef.current?.pause();
      setPlaybackState("paused");
      return;
    }

    if (playbackState === "paused" && wavesurferRef.current) {
      await wavesurferRef.current.play();
      setPlaybackState("playing");
      return;
    }

    if (selectedText) {
      await synthesizeAndPlay(selectedText);
    }
  };

  const onWordMouseDown = (index: number) => {
    setDragStart(index);
    setDragEnd(index);
  };

  const onWordMouseEnter = (index: number) => {
    if (dragStart !== null) {
      setDragEnd(index);
    }
  };

  const onMouseUp = () => {
    if (dragStart === null || dragEnd === null) {
      return;
    }

    setSelectionStart(dragStart);
    setSelectionEnd(dragEnd);
    setDragStart(null);
    setDragEnd(null);
  };

  useEffect(() => {
    if (!selectedText) {
      return;
    }
    void synthesizeAndPlay(selectedText);
    // selectedText change should retrigger synthesis
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedText]);

  useEffect(() => {
    if (wavesurferRef.current) {
      const base = generatedBaseSpeedRef.current || 1;
      manualPlaybackFactorRef.current = speed / base;
      wavesurferRef.current.setPlaybackRate(manualPlaybackFactorRef.current);
    }
  }, [speed]);

  useEffect(() => {
    if (!waveContainerRef.current) {
      return;
    }

    const ws = WaveSurfer.create({
      container: waveContainerRef.current,
      waveColor: "#737373",
      progressColor: "#f5f5f5",
      cursorColor: "#ffffff",
      barWidth: 2,
      barGap: 2,
      barRadius: 8,
      height: 82,
      normalize: true,
      interact: true,
    });

    ws.on("finish", () => {
      setPlaybackState("idle");
    });

    ws.on("pause", () => {
      setPlaybackState((prev) => (prev === "idle" || prev === "loading" ? prev : "paused"));
    });

    ws.on("play", () => {
      setPlaybackState("playing");
    });

    ws.setPlaybackRate(speed);
    wavesurferRef.current = ws;

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
    // initialize once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const path = event.composedPath();
      const clickedText =
        !!textZoneRef.current?.contains(target) ||
        (!!textZoneRef.current && path.includes(textZoneRef.current));
      const clickedControls =
        !!controlsRef.current?.contains(target) ||
        (!!controlsRef.current && path.includes(controlsRef.current));
      const clickedWaveform =
        !!waveContainerRef.current?.contains(target) ||
        (!!waveContainerRef.current && path.includes(waveContainerRef.current));
      if (!clickedText && !clickedControls && !clickedWaveform) {
        requestTokenRef.current += 1;
        stopAudio(true);
      }
    };

    document.addEventListener("mousedown", onDocMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
    };
    // safe one-time setup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      requestTokenRef.current += 1;
      stopAudio(false);
    };
    // safe cleanup only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const liveStart = dragStart ?? range?.start ?? -1;
  const liveEnd = dragEnd ?? range?.end ?? -1;

  return (
    <main className="page">
      <section className="hero-card">
        <div className="brand-lockup">
          <div className="brand-photo-panel">
            <img
              src="/mccaffrey-center.png"
              alt="University of the Pacific campus scene"
              className="brand-photo"
            />
          </div>
          <div className="brand-logo-panel">
            <img
              src="/eleven-labs-banner.png"
              alt="ElevenLabs banner"
              className="brand-logo"
            />
          </div>
        </div>
        <p className="eyebrow">ElevenLabs • Exploration page for SSD Center</p>
        <h1>Text-to-Speech Demo for SSD Center</h1>
        <p className="subtitle">
          Select text below. Playback starts automatically.
        </p>

        <div ref={controlsRef}>
          <div className="controls">
            <button
              type="button"
              onClick={() => void handlePlayPause()}
              disabled={!canPlay}
            >
              {playbackState === "playing"
                ? "❚❚ pause"
                : playbackState === "loading"
                  ? "..."
                  : "► play"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!canStop}
              onClick={() => {
                requestTokenRef.current += 1;
                stopAudio(true);
              }}
            >
              ◼ stop
            </button>
          </div>
          <div className="speed-controls">
            <span>speed: {speed.toFixed(1)}</span>
            <button
              type="button"
              className="speed-button"
              onClick={() => updateSpeed(speed + 0.1)}
              aria-label="Increase speed"
            >
              +
            </button>
            <button
              type="button"
              className="speed-button"
              onClick={() => updateSpeed(speed - 0.1)}
              aria-label="Decrease speed"
            >
              –
            </button>
          </div>
        </div>

        <div className={`wave-shell ${showWaveform ? "visible" : "hidden"}`}>
          <div
            id="waveform"
            ref={waveContainerRef}
            className={`wave ${playbackState === "playing" ? "running" : "paused"}`}
          />
        </div>

        <div ref={textZoneRef} className="text-zone" onMouseUp={onMouseUp}>
          {lines.map((line, lineIndex) => (
            <p
              key={`line-${lineIndex}`}
              className={line.isBullet ? "text-line text-bullet" : "text-line"}
            >
              {line.isBullet && <span className="bullet-dot">•</span>}
              {line.words.map((word) => {
                const index = word.index;
                const min = Math.min(liveStart, liveEnd);
                const max = Math.max(liveStart, liveEnd);
                const isSelected = min >= 0 && index >= min && index <= max;

                return (
                  <span
                    key={`${lineIndex}-${index}-${word.text}`}
                    className={`word ${isSelected ? "selected" : ""}`}
                    onMouseDown={() => onWordMouseDown(index)}
                    onMouseEnter={() => onWordMouseEnter(index)}
                  >
                    {word.text}{" "}
                  </span>
                );
              })}
            </p>
          ))}
        </div>

        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
