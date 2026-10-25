import { useEffect, useRef, useState } from "react";

interface ChatComposerProps {
  disabled: boolean;
  busy: boolean;
  mobile: boolean;
  focusSignal: number;
  onSend: (content: string) => void;
}

function SendIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M3.4 20.4 21 12 3.4 3.6 5 11H15v2H5l-1.6 7.4Z" />
    </svg>
  );
}

export function ChatComposer({
  disabled,
  busy,
  mobile,
  focusSignal,
  onSend,
}: ChatComposerProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    const lineHeight = 22;
    const maxHeight = lineHeight * 4 + 14;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [text]);

  useEffect(() => {
    if (focusSignal > 0 && !disabled) {
      textareaRef.current?.focus();
    }
  }, [focusSignal, disabled]);

  const placeholder = busy
    ? "Quorum is answering"
    : mobile
      ? "Ask a question"
      : "Ask a question or submit a proposal for review";

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) {
      return;
    }
    onSend(trimmed);
    setText("");
  };

  return (
    <form
      className="quorum-chat-composer"
      data-disabled={disabled ? "true" : "false"}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={textareaRef}
        rows={1}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        aria-label="Message"
        onChange={(event) => {
          setText(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <button
        type="submit"
        className="quorum-chat-send"
        aria-label="Send"
        disabled={disabled || !text.trim()}
      >
        <SendIcon />
      </button>
    </form>
  );
}
