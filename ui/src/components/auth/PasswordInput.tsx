"use client";

/**
 * A password field with a reveal toggle.
 *
 * Uncontrolled on purpose. A password manager ("Suggest strong password",
 * "Use saved password") writes into the DOM node directly, and a controlled
 * input whose React state never heard about that write is reset to "" on the
 * next render, which is exactly the "I clicked Use password and the box is
 * empty" report. Nothing React does can clear an uncontrolled input, and the
 * form reads the node's value at submit time, so whatever the browser or the
 * person put there is what gets sent.
 *
 * The eye toggles `type` between password and text; the value survives the
 * switch in every browser.
 */

import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import React, { useState } from "react";

interface PasswordInputProps {
  id: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  autoComplete: "new-password" | "current-password";
  invalid?: boolean;
}

const PasswordInput: React.FC<PasswordInputProps> = ({
  id,
  inputRef,
  autoComplete,
  invalid = false,
}) => {
  const [shown, setShown] = useState(false);

  return (
    <div className="auth-password">
      <input
        id={id}
        ref={inputRef}
        className={
          "auth-input auth-input--password" +
          (invalid ? " auth-input--invalid" : "")
        }
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        autoCapitalize="off"
        spellCheck={false}
        aria-invalid={invalid || undefined}
      />
      <button
        type="button"
        className="auth-reveal"
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        onClick={() => setShown((current) => !current)}
      >
        {shown ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
      </button>
    </div>
  );
};

export default PasswordInput;
