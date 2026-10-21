"use client";

import { useState, type MouseEvent } from "react";
import { Check, Link2 } from "lucide-react";

export default function CopyLookLink({
  lookId,
  className = "",
}: {
  lookId: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const url = `${window.location.origin}/looks/${lookId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={className}>
      <button type="button" onClick={copy} className="copy-look-btn">
        {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
        {copied ? "Link copied" : "Copy link"}
      </button>
      <p className="copy-look-note">The same look opens in the app.</p>
      <style>{`
        .copy-look-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid var(--border-soft);
          background: var(--bg-section);
          color: var(--text-main);
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .copy-look-btn:hover { border-color: var(--rose-primary); color: var(--rose-primary); }
        .copy-look-note {
          margin: 6px 0 0;
          font-size: 11.5px;
          font-weight: 400;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
