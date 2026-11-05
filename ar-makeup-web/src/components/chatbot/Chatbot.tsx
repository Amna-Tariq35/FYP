'use client';

import { useState, useRef, useEffect } from 'react';
import {
  MessageCircle,
  X,
  Send,
  Sparkles,
  Loader2,
  ShoppingCart,
  ChevronRight,
} from 'lucide-react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { UIMessage } from 'ai';
import { addToCart } from '@/src/store/cart';
import { assistantBubbleText, CHAT_FAILURE_MESSAGE, friendlyChatError } from '@/src/lib/chat/public-error';

// ── Types ────────────────────────────────────────────────────────────────────

interface ProductShade {
  id: string;
  shade_name?: string;
  color_family?: string;
  shade_hex?: string;
  skin_tone?: string;
  undertone?: string;
  shade_key: string;
}

interface Product {
  id: string;
  product_key: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  currency: string;
  image_url?: string;
  finish?: string;
  coverage?: string;
  skin_type?: string;
  item_form?: string;
  description?: string;
  product_shades?: ProductShade[];
}

// ── Product Card Component ────────────────────────────────────────────────────

function ProductCard({ product }: { product: Product }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const needsShadeChoice = (product.product_shades ?? []).length > 0;

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (needsShadeChoice) {
      if (!product.product_key) return;
      router.push(`/products/${encodeURIComponent(product.product_key)}`);
      return;
    }
    setAdding(true);
    try {
      addToCart({
        product_key: product.product_key,
        shade_key: 'no-shade',
        shade_name: 'No Shade',
        quantity: 1,
        name: product.name,
        brand: product.brand,
        price: product.price,
        image_url: product.image_url ?? null,
      });
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch (err) {
      console.error('Add to cart error:', err);
    } finally {
      setAdding(false);
    }
  };

  const shade = product.product_shades?.[0];

  return (
    <div
      onClick={() => {
        if (!product.product_key) return;
        router.push(`/products/${encodeURIComponent(product.product_key)}`);
      }}
      className="group flex gap-3 bg-white rounded-2xl border border-[var(--border-soft)] shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden"
      style={{ borderLeft: `3px solid var(--rose-primary)` }}
    >
      <div className="w-20 h-20 flex-shrink-0 bg-[var(--bg-base)] overflow-hidden rounded-l-xl">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl">💄</div>
        )}
      </div>

      <div className="flex-1 py-2 pr-2 min-w-0">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-[10px] font-semibold text-[var(--rose-primary)] uppercase tracking-wide truncate">
            {product.brand}
          </span>
          {product.category && (
            <span className="text-[10px] text-[var(--text-muted)] truncate">· {product.category}</span>
          )}
        </div>

        <p className="text-xs font-semibold text-[var(--text-main)] leading-tight line-clamp-1 mb-1">
          {product.name}
        </p>

        {shade && (
          <div className="flex items-center gap-1 mb-1.5">
            {shade.shade_hex && (
              <div
                className="w-3 h-3 rounded-full border border-white shadow-sm flex-shrink-0"
                style={{ backgroundColor: shade.shade_hex }}
              />
            )}
            <span className="text-[10px] text-[var(--text-muted)] truncate">
              {shade.shade_name || shade.color_family}
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-1 mb-1.5">
          {product.finish && (
            <span className="text-[9px] bg-[#FDF2F4] text-[var(--rose-primary)] px-1.5 py-0.5 rounded-full font-medium">
              {product.finish}
            </span>
          )}
          {product.skin_type && (
            <span className="text-[9px] bg-[#FDF2F4] text-[var(--rose-primary)] px-1.5 py-0.5 rounded-full font-medium">
              {product.skin_type}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-[var(--text-main)]">
            ${Number(product.price).toFixed(2)}
          </span>
          <button
            onClick={handleAddToCart}
            disabled={adding}
            className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all duration-200"
            style={{
              background: added ? '#22c55e' : 'var(--rose-primary)',
              color: 'white',
              opacity: adding ? 0.7 : 1,
            }}
          >
            {adding ? (
              <Loader2 size={10} className="animate-spin" />
            ) : added ? (
              '✓ Added!'
            ) : needsShadeChoice ? (
              'Choose shade'
            ) : (
              <>
                <ShoppingCart size={10} />
                Add
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight size={14} className="text-[var(--rose-primary)]" />
      </div>
    </div>
  );
}

// ── Extract products from tool result parts ───────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isProduct(value: unknown): value is Product {
  return isRecord(value) && typeof value.product_key === 'string' && typeof value.name === 'string';
}

function toolOutput(part: UIMessage['parts'][number]): Record<string, unknown> | null {
  if (!part.type.startsWith('tool-') || part.type === 'dynamic-tool') return null;
  if (!('state' in part) || part.state !== 'output-available') return null;
  if (!('output' in part) || !isRecord(part.output)) return null;
  return part.output;
}

function extractProductsFromParts(parts: UIMessage['parts']): Product[] {
  for (const part of parts) {
    const output = toolOutput(part);
    if (!output || output.success !== true || !Array.isArray(output.products)) continue;
    const products = output.products.filter(isProduct).filter((product) => product.product_key);
    if (products.length > 0) return products;
  }
  return [];
}

function extractCatalogHref(parts: UIMessage['parts']): string | null {
  for (const part of parts) {
    const output = toolOutput(part);
    if (output?.catalogHref === '/products') return '/products';
  }
  return null;
}

// ── Main Chatbot Component ────────────────────────────────────────────────────

export default function Chatbot() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const restoreLauncherFocus = useRef(false);
  const [input, setInput] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [stopped, setStopped] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastTextRef = useRef('');

  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    onError: (error) => {
      console.error('Chat request failed');
      setChatError(friendlyChatError(error));
      setStopped(true);
      setSlow(false);
    },
  });

  const isLoading = (status === 'submitted' || status === 'streaming') && !stopped;
  const stopRef = useRef(stop);
  stopRef.current = stop;

  useEffect(() => {
    if (!isLoading) {
      setSlow(false);
      return;
    }
    const slowTimer = window.setTimeout(() => setSlow(true), 8_000);
    const failTimer = window.setTimeout(() => {
      stopRef.current();
      setStopped(true);
      setSlow(false);
      setChatError(CHAT_FAILURE_MESSAGE);
    }, 30_000);
    return () => {
      window.clearTimeout(slowTimer);
      window.clearTimeout(failTimer);
    };
  }, [isLoading]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatError, isLoading, slow]);

  useEffect(() => {
    if (isOpen || !restoreLauncherFocus.current) return;
    restoreLauncherFocus.current = false;
    launcherRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      restoreLauncherFocus.current = true;
      setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const closeChat = () => {
    restoreLauncherFocus.current = true;
    setIsOpen(false);
  };

  const sendText = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    lastTextRef.current = trimmed;
    setStopped(false);
    setSlow(false);
    setChatError(null);
    sendMessage({ text: trimmed });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendText(input);
    if (input.trim()) setInput('');
  };

  if (pathname?.startsWith('/admin')) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen && (
        <div
          className="bg-white w-[min(360px,calc(100vw-2rem))] h-[560px] rounded-2xl shadow-2xl flex flex-col mb-4 overflow-hidden animate-in slide-in-from-bottom-5"
          style={{ border: '1px solid var(--border-soft)' }}
        >
          {/* ── Header ── */}
          <div
            className="text-white p-4 flex justify-between items-center shadow-sm flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #C06C84 0%, #e07a90 100%)' }}
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles size={16} />
              </div>
              <div>
                <h3 className="font-semibold text-sm leading-tight">AI Beauty Advisor</h3>
                <p className="text-[10px] text-white/75 leading-tight">Powered by AI ✨</p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeChat}
              aria-label="Close chat"
              className="hover:bg-white/20 p-1.5 rounded-full transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* ── Messages ── */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ background: 'var(--bg-base)' }}>
            {/* Welcome message */}
            {messages.length === 0 && (
              <div className="text-center py-6">
                <div className="text-3xl mb-3">💄</div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                  Hi! I'm your AI Beauty Advisor
                </p>
                <p className="text-xs mt-1.5 mb-4" style={{ color: 'var(--text-muted)' }}>
                  Tell me about your skin and I'll find perfect products for you!
                </p>
                <div className="flex flex-col gap-2">
                  {[
                    '🌿 Oily skin, fair tone — suggest foundation',
                    '💋 Nude lipstick for warm undertone',
                    '✨ Matte blush for dry skin',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        sendText(suggestion.replace(/^[^\w]+/, ''));
                      }}
                      className="text-xs px-3 py-2 rounded-xl text-left transition-all hover:shadow-sm disabled:opacity-50"
                      style={{
                        background: 'white',
                        border: '1px solid var(--border-soft)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages List */}
            {messages.map((m, messageIndex) => {
              const products = extractProductsFromParts(m.parts);
              const catalogHref = extractCatalogHref(m.parts);
              const isUser = m.role === 'user';
              const assistantText = isUser
                ? ''
                : m.parts
                    .map((part) => (part.type === 'text' ? assistantBubbleText(part.text) : ''))
                    .filter(Boolean)
                    .join('\n')
                    .trim();
              const showFallbackLine =
                !isUser &&
                !assistantText &&
                !chatError &&
                (!isLoading || messageIndex !== messages.length - 1);

              return (
                <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-2`}>
                  {m.parts.map((part, index) => {
                    const text = part.type === 'text' ? (isUser ? part.text.trim() : assistantBubbleText(part.text)) : '';
                    if (part.type === 'text' && text) {
                      return (
                        <div
                          key={index}
                          className="p-3 rounded-2xl max-w-[85%] text-sm shadow-sm"
                          style={{
                            background: isUser ? 'var(--rose-primary)' : 'white',
                            color: isUser ? 'white' : 'var(--text-main)',
                            borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                            border: isUser ? 'none' : '1px solid var(--border-soft)',
                          }}
                        >
                          <div className="whitespace-pre-wrap leading-relaxed">{text}</div>
                        </div>
                      );
                    }

                    if ((part.type as string) === 'tool-invocation') {
                      return (
                        <div
                          key={index}
                          className="flex items-center gap-2 text-xs px-3 py-2 rounded-full"
                          style={{
                            background: '#FDF2F4',
                            color: 'var(--rose-primary)',
                          }}
                        >
                          <Loader2 size={11} className="animate-spin" />
                          <span className="font-medium">Searching products...</span>
                        </div>
                      );
                    }

                    return null;
                  })}

                  {showFallbackLine && (
                    <div
                      className="p-3 rounded-2xl max-w-[85%] text-sm shadow-sm"
                      style={{
                        background: 'white',
                        color: 'var(--text-main)',
                        borderRadius: '18px 18px 18px 4px',
                        border: '1px solid var(--border-soft)',
                      }}
                    >
                      {CHAT_FAILURE_MESSAGE}
                    </div>
                  )}

                  {/* Product Cards */}
                  {!isUser && products.length > 0 && (
                    <div className="w-full space-y-2 mt-1">
                      <p
                        className="text-[10px] font-semibold uppercase tracking-wider px-1"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Recommended Products
                      </p>
                      {products.filter((product) => product.product_key).map((product) => (
                        <ProductCard key={product.product_key} product={product} />
                      ))}
                    </div>
                  )}
                  {!isUser && products.length === 0 && catalogHref && (
                    <Link
                      href={catalogHref}
                      className="text-xs font-semibold underline"
                      style={{ color: 'var(--rose-primary)' }}
                    >
                      Browse products
                    </Link>
                  )}
                </div>
              );
            })}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex flex-col items-start gap-1">
                <div
                  className="flex items-center gap-2 text-xs px-3 py-2 rounded-full"
                  style={{ background: '#FDF2F4', color: 'var(--rose-primary)' }}
                >
                  <Loader2 size={11} className="animate-spin" />
                  <span className="font-medium">Thinking...</span>
                </div>
                {slow && (
                  <p className="text-[10px] px-1" style={{ color: 'var(--text-muted)' }}>
                    Still thinking...
                  </p>
                )}
              </div>
            )}

            {/* Structured Error Card */}
            {chatError && !isLoading && (
              <div className="flex flex-col items-start gap-2">
                <div
                  className="p-3 rounded-2xl max-w-[85%] text-sm shadow-sm"
                  style={{
                    background: 'white',
                    color: 'var(--text-main)',
                    borderRadius: '18px 18px 18px 4px',
                    border: '1px solid var(--border-soft)',
                  }}
                >
                  {chatError}
                </div>
                <button
                  type="button"
                  onClick={() => sendText(lastTextRef.current)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{ background: 'var(--rose-primary)', color: 'white' }}
                >
                  Try again
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Input Bar ── */}
          <form
            onSubmit={handleSubmit}
            className="p-3 flex gap-2 items-center flex-shrink-0"
            style={{
              background: 'white',
              borderTop: '1px solid var(--border-soft)',
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask for beauty recommendations..."
              className="flex-1 rounded-full px-4 py-2.5 text-sm transition-all focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
              style={{
                background: 'var(--bg-base)',
                border: '1px solid var(--border-soft)',
                color: 'var(--text-main)',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--rose-primary)';
                e.target.style.boxShadow = '0 0 0 3px rgba(192,108,132,0.15)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border-soft)';
                e.target.style.boxShadow = 'none';
              }}
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={isLoading || !input.trim()}
              className="text-white p-2.5 rounded-full transition-all flex items-center justify-center shadow-md disabled:opacity-50"
              style={{ background: 'var(--rose-primary)' }}
            >
              <Send size={16} className={isLoading ? 'opacity-50' : ''} />
            </button>
          </form>
        </div>
      )}

      {/* ── Floating Button ── */}
      {!isOpen && (
        <button
          type="button"
          ref={launcherRef}
          onClick={() => setIsOpen(true)}
          aria-label="Open chat"
          className="text-white p-4 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center relative"
          style={{ background: 'linear-gradient(135deg, var(--rose-primary) 0%, #e07a90 100%)' }}
        >
          <MessageCircle size={26} />
          <span
            className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full animate-ping"
            style={{ background: 'var(--rose-soft)' }}
          />
          <span
            className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full"
            style={{ background: 'var(--rose-primary)' }}
          />
        </button>
      )}
    </div>
  );
}