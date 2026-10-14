"use client";

import * as React from "react";

export interface LiveAnnouncerContextValue {
  announce: (message: string) => void;
}

const LiveAnnouncerContext = React.createContext<LiveAnnouncerContextValue>({
  announce: () => {},
});

export function LiveAnnouncerProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = React.useState<string>("");

  const announce = React.useCallback((newMessage: string) => {
    setMessage(newMessage);
  }, []);

  return (
    <LiveAnnouncerContext.Provider value={{ announce }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="live-announcer"
      >
        {message}
      </div>
    </LiveAnnouncerContext.Provider>
  );
}

export function useAnnounce(): LiveAnnouncerContextValue {
  return React.useContext(LiveAnnouncerContext);
}
