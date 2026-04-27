import { useState } from "preact/hooks";

export default function ChatBox({ messages, onSend, isLoading, isDisabled }) {
  const [draft, setDraft] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isDisabled || isLoading) {
      return;
    }

    onSend(message);
    setDraft("");
  }

  return (
    <section className="chat-box" data-testid="chat-box">
      <div className="section-header">
        <div className="section-icon">
          <span className="lucide" data-lucide="bot" style={{ width: 16, height: 16 }} />
        </div>
        <span className="section-title">Supply Chain AI</span>
      </div>

      <div className="chat-messages" data-testid="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty-inline" data-testid="chat-empty-inline">
            No conversation yet.
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`chat-message ${message.role}`}
              data-testid={`chat-message-${message.role}-${index}`}
            >
              <div className="message-role">
                {message.role === "user" ? "You" : "AI Assistant"}
              </div>
              {message.text}
            </div>
          ))
        )}
        {isLoading && (
          <div className="chat-message assistant" style={{ opacity: 0.7 }}>
            <div className="message-role">AI Assistant</div>
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="spinner" style={{ width: 14, height: 14 }} />
              Thinking...
            </span>
          </div>
        )}
      </div>

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <input
          className="input"
          value={draft}
          onInput={(event) => setDraft(event.currentTarget.value)}
          placeholder={isDisabled ? "Compute a route first..." : "Ask about this scenario..."}
          disabled={isDisabled}
          data-testid="chat-input"
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isDisabled || isLoading || !draft.trim()}
          data-testid="chat-send-button"
        >
          <span className="lucide" data-lucide="send" style={{ width: 16, height: 16 }} />
        </button>
      </form>

      <div className="chat-helper-inline" data-testid="chat-helper-inline">
        Ask Supply Chain AI about delays, risk, or dispatch timing.
      </div>
    </section>
  );
}
