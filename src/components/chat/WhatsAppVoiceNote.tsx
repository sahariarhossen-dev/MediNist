import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, Mic, User } from "lucide-react";

export interface WhatsAppVoiceNoteProps {
  audioUrl: string;
  duration?: number;
  fallbackDuration?: string | number;
  timestamp?: string;
  avatarUrl?: string;
  isSender?: boolean;
}

// 28 realistic voice modulation waveform bar heights (percentage of container height)
const WAVEFORM_HEIGHTS = [
  20, 35, 60, 40, 80, 50, 90, 70, 30, 40, 85, 60, 40, 95, 30, 45, 75, 90, 50,
  65, 85, 40, 70, 55, 80, 60, 35, 25,
];

// Helper to format seconds into mm:ss (e.g. 0:05, 1:12)
const formatTime = (totalSeconds: number): string => {
  if (!isFinite(totalSeconds) || isNaN(totalSeconds) || totalSeconds < 0) {
    return "0:00";
  }
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
};

export const WhatsAppVoiceNote: React.FC<WhatsAppVoiceNoteProps> = ({
  audioUrl,
  duration: propDuration,
  fallbackDuration,
  timestamp,
  avatarUrl,
  isSender = true,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(
    propDuration || (typeof fallbackDuration === "number" ? fallbackDuration : 0)
  );
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);

  // Initialize and manage HTML5 Audio object bound to props.audioUrl
  useEffect(() => {
    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setAudioDuration(audio.duration);
      }
      setIsLoaded(true);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      // In some browsers, WebM duration is only reported once playback starts
      if (isFinite(audio.duration) && audio.duration > 0) {
        setAudioDuration((prev) => (prev > 0 ? prev : audio.duration));
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.src = "";
      audioRef.current = null;
    };
  }, [audioUrl]);

  // Update duration if propDuration arrives later
  useEffect(() => {
    if (propDuration && propDuration > 0) {
      setAudioDuration((prev) => (prev > 0 ? prev : propDuration));
    }
  }, [propDuration]);

  // Handle Play/Pause toggle
  const togglePlay = async () => {
    if (!audioRef.current) return;
    try {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        await audioRef.current.play();
      }
    } catch (err) {
      console.warn("[WhatsAppVoiceNote] Playback error:", err);
    }
  };

  // Click-to-seek along waveform container
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current || !audioRef.current) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const effectiveDuration = audioDuration > 0 ? audioDuration : (propDuration || 0);

    if (effectiveDuration > 0 && isFinite(effectiveDuration)) {
      const targetTime = ratio * effectiveDuration;
      audioRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
    }
  };

  const effectiveDuration = audioDuration > 0 ? audioDuration : (propDuration || 0);
  const progress = effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;

  // Display timer: current position when playing, or total duration / fallbackDuration when paused
  const defaultDisplay = fallbackDuration
    ? typeof fallbackDuration === "string"
      ? fallbackDuration
      : formatTime(fallbackDuration)
    : "0:00";

  const displayTimer = isPlaying
    ? formatTime(currentTime)
    : currentTime > 0
    ? formatTime(currentTime)
    : effectiveDuration > 0
    ? formatTime(effectiveDuration)
    : defaultDisplay;

  return (
    <div
      id="whatsapp-voice-note-container"
      className={`relative flex items-center gap-2 rounded-2xl p-2.5 sm:p-3 shadow-sm select-none transition-all duration-150 max-w-full w-[290px] sm:w-[320px] ${
        isSender
          ? "bg-[#005c4b] text-white border border-[#006a57]/40"
          : "bg-[#1f2c34] text-slate-100 border border-slate-700/60"
      }`}
    >
      {/* 1. Left Column: Circular Play/Pause Button */}
      <button
        id="vn-play-pause-btn"
        type="button"
        onClick={togglePlay}
        title={isPlaying ? "Pause voice note" : "Play voice note"}
        aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 active:scale-95 text-white transition-all cursor-pointer shadow-2xs"
      >
        {isPlaying ? (
          <Pause className="h-4 w-4 fill-white" />
        ) : (
          <Play className="h-4 w-4 fill-white ml-0.5" />
        )}
      </button>

      {/* 2. Center Column: Waveform Track + Scrubber + Timers */}
      <div className="flex flex-1 flex-col justify-center px-2 min-w-0">
        {/* Top: Waveform Track + Scrubber Thumb Container */}
        <div
          id="vn-waveform-track"
          ref={waveformRef}
          onClick={handleSeek}
          className="relative flex h-7 items-center gap-0.5 cursor-pointer py-1 group"
          title="Click to seek"
        >
          {WAVEFORM_HEIGHTS.map((heightPercent, index) => {
            const barProgress = (index / (WAVEFORM_HEIGHTS.length - 1)) * 100;
            const isActive = barProgress <= progress;

            return (
              <div
                key={index}
                className="flex-1 flex items-center justify-center h-full"
              >
                <div
                  style={{ height: `${heightPercent}%` }}
                  className={`w-full max-w-[3px] rounded-full transition-colors duration-100 ${
                    isActive
                      ? "bg-emerald-400"
                      : "bg-white/35 group-hover:bg-white/45"
                  }`}
                />
              </div>
            );
          })}

          {/* WhatsApp Scrubber Thumb */}
          <div
            id="vn-scrubber-thumb"
            style={{
              left: `${progress}%`,
            }}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-emerald-400 shadow-md ring-2 ring-white/30 pointer-events-none transition-all duration-75"
          />
        </div>

        {/* Bottom Row: Current playback position & Sent timestamp */}
        <div className="flex items-center justify-between text-[11px] font-medium leading-none text-emerald-100/90 pt-0.5">
          <span id="vn-playback-time" className="tracking-tight tabular-nums">
            {displayTimer}
          </span>
          {timestamp && (
            <span
              id="vn-timestamp"
              className="text-[10px] text-emerald-200/70 tracking-tight ml-2"
            >
              {timestamp}
            </span>
          )}
        </div>
      </div>

      {/* 3. Right Column: User Avatar with Mic Badge */}
      <div
        id="vn-avatar-container"
        className="relative h-10 w-10 shrink-0 select-none overflow-visible"
      >
        {/* Profile image or Fallback Initials */}
        <div className="h-10 w-10 overflow-hidden rounded-full border border-white/20 bg-emerald-700/60 shadow-2xs flex items-center justify-center text-white font-semibold text-xs">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="User"
              className="h-full w-full object-cover rounded-full"
              referrerPolicy="no-referrer"
              onError={(e) => {
                // If avatar image fails to load, replace with initials icon
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <User className="h-5 w-5 text-emerald-100/80" />
          )}
        </div>

        {/* Green Mic Badge at bottom-left corner of avatar circle */}
        <div
          id="vn-mic-badge"
          className="absolute -bottom-0.5 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white p-0.5 border-2 border-slate-900 shadow-xs"
          title="Voice Note"
        >
          <Mic className="h-2.5 w-2.5 fill-current" />
        </div>
      </div>
    </div>
  );
};
