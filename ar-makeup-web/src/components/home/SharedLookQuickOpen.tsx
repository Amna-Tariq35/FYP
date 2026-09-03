"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function extractLookId(input: string) {
  const value = input.trim();
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const looksIndex = parts.indexOf("looks");
    if (looksIndex !== -1 && parts[looksIndex + 1]) return parts[looksIndex + 1];
  } catch {}
  return value || null;
}

export default function SharedLookQuickOpen() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onOpen() {
    const id = extractLookId(text);
    if (!id) {
      setError("Please paste a valid shared link or look ID.");
      return;
    }
    setError(null);
    router.push(`/looks/${id}`);
  }

  return (
    <section className="mt-10 rounded-[22px] border border-black/8 bg-white/65 p-6 backdrop-blur sm:p-8">
      <h3 className="text-[15px] font-medium text-[#1a0e13]">
        Open a shared look
      </h3>
      <p className="mt-1 text-xs font-light text-[#7a5a65]">
        Paste a link from the mobile app or enter a look ID to view details.
      </p>

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          placeholder="https://your-site.com/looks/xxxxx"
          className="w-full rounded-2xl border border-black/8 bg-white/80 px-4 py-3 text-sm font-light text-[#1a0e13] placeholder:text-black/30 outline-none transition focus:border-[#B65C7A]/40 focus:ring-2 focus:ring-[#B65C7A]/10"
        />
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 rounded-2xl bg-[#B65C7A] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#A94E6C]"
        >
          Open look
        </button>
      </div>

      {error && (
        <p className="mt-3 text-[12px] text-[#B65C7A]">{error}</p>
      )}
    </section>
  );
}