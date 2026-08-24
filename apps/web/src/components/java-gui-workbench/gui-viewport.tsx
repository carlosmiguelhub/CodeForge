"use client";

import RFB from "@novnc/novnc";
import { Maximize2, Minimize2, MousePointerClick } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function GuiViewport({ url }: Readonly<{ url: string | null }>) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [showHint, setShowHint] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!url || !containerRef.current) return;
    setStatus("connecting");
    setShowHint(true);
    const rfb = new RFB(containerRef.current, url);
    // Fixed 1280x800 virtual display (see the runtime image's Xvfb flags)
    // — scale to fit the panel via CSS/noVNC's own scaling rather than
    // renegotiating the remote resolution, which restarting Xvfb doesn't
    // support mid-session anyway.
    rfb.scaleViewport = true;
    rfb.resizeSession = false;

    const onConnect = () => setStatus("connected");
    const onDisconnect = () => setStatus("disconnected");
    rfb.addEventListener("connect", onConnect);
    rfb.addEventListener("disconnect", onDisconnect);

    return () => {
      rfb.removeEventListener("connect", onConnect);
      rfb.removeEventListener("disconnect", onDisconnect);
      rfb.disconnect();
    };
  }, [url]);

  useEffect(() => {
    const handleChange = () =>
      setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void wrapperRef.current?.requestFullscreen();
    }
  }

  if (!url)
    return (
      <div className="text-ink-muted grid h-full place-items-center p-8 text-xs">
        <div className="text-center">
          <MousePointerClick
            aria-hidden="true"
            className="mx-auto mb-2"
            size={20}
          />
          Run your program to see its window here.
        </div>
      </div>
    );

  return (
    <div ref={wrapperRef} className="relative h-full w-full bg-black">
      <div
        ref={containerRef}
        className="h-full w-full"
        onClick={() => setShowHint(false)}
      />
      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
        className="border-structural bg-elevated/90 text-ink-secondary hover:text-ink-primary rounded-control absolute top-2 right-2 z-20 grid size-8 place-items-center border"
      >
        {isFullscreen ? (
          <Minimize2 aria-hidden="true" size={14} />
        ) : (
          <Maximize2 aria-hidden="true" size={14} />
        )}
      </button>
      {status !== "connected" ? (
        <div className="text-ink-muted bg-canvas/80 absolute inset-0 grid place-items-center text-xs">
          {status === "connecting"
            ? "Connecting to your program…"
            : "Disconnected."}
        </div>
      ) : showHint ? (
        <div className="border-structural bg-elevated text-ink-secondary rounded-control pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 border px-3 py-1.5 text-[11px] shadow-lg">
          Click the window to interact with it
        </div>
      ) : null}
    </div>
  );
}
