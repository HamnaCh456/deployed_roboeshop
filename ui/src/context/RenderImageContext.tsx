"use client";

/**
 * The image the assistant renders into on /assistant.
 *
 * Either chat surface can set it — the full-height Chatbox on /assistant or
 * the corner ChatWidget on the catalogue — and Apparel displays it. Under
 * react-router this was one `useState` in App.tsx threaded down as props; an
 * App Router layout is a server component and cannot hold client state for
 * its pages, so the same state lives here and the layout mounts the provider.
 */

import React, { createContext, useContext, useState } from "react";

interface RenderImageState {
  newRenderImage: string;
  setNewRenderImage: (value: string) => void;
}

const RenderImageContext = createContext<RenderImageState>({
  newRenderImage: "",
  setNewRenderImage: () => {},
});

export const RenderImageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [newRenderImage, setNewRenderImage] = useState<string>("");
  return (
    <RenderImageContext.Provider value={{ newRenderImage, setNewRenderImage }}>
      {children}
    </RenderImageContext.Provider>
  );
};

export const useRenderImage = () => useContext(RenderImageContext);
