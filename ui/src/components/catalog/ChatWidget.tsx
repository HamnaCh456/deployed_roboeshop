/**
 * The assistant, docked as a corner widget.
 *
 * On the original screen the chat owns 60vw of the window permanently. The
 * catalogue needs that width for the grid, so here the same Chatbox is mounted
 * inside a smaller fixed frame behind a launcher.
 *
 * It stays mounted once opened, not unmounted on close, because Chatbox holds
 * the conversation in local state — unmounting would silently discard it.
 */

"use client";

import React, { useState } from "react";
import CloseIcon from "@mui/icons-material/Close";

import Chatbox from "../chatbox/chatbox";
import Mark from "../Mark";
import { config } from "../../config/config";

const ChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  const open = () => {
    setIsOpen(true);
    setHasOpened(true);
  };

  return (
    <>
      {hasOpened && (
        <div className={`chat-widget${isOpen ? " chat-widget--open" : ""}`}>
          <Chatbox />
        </div>
      )}

      <button
        type="button"
        className="chat-launcher"
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <>
            <CloseIcon fontSize="small" />
            Close
          </>
        ) : (
          <>
            {/* The mark in white on the ink pill; the label is the same
                "Ask Servo" the navbar, hero and footer use. */}
            <Mark width={18} />
            Ask {config.ui.brand}
          </>
        )}
      </button>
    </>
  );
};

export default ChatWidget;
