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
  AlertTriangle,
  WifiOff,
  ServerOff,
  AlertCircle,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useRouter } from 'next/navigation';
import { addToCart } from '@/src/store/cart';

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

type ErrorType = 'RATE_LIMIT' | 'NETWORK' | 'SERVER' | 'GENERIC';

interface ChatError {
  type: ErrorType;
  title: string;
  message: string;
}

// ── Product Card Component ────────────────────────────────────────────────────

function ProductCard({ product }: { product: Product }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setAdding(true);
    try {
      const shade = product.product_shades?.[0];
      addToCart({
        product_key: product.product_key,
        shade_key: shade?.shade_key ?? 'no-shade',
        shade_name: shade?.shade_name ?? 'No Shade',
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
      onClick={() => router.push(`/products/${product.product_key || product.id}`)}
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

function extractProductsFromParts(parts: any[]): Product[] {
  if (!Array.isArray(parts)) return [];
  for (const part of parts) {
    if (
      part.type?.startsWith('tool-') &&
      part.type !== 'tool-invocation' &&
      part.state === 'output-available' &&
      part.output?.success === true &&
      Array.isArray(part.output?.products) &&
      part.output.products.length > 0
    ) {
      return part.output.products as Product[];
    }
  }
  return [];
}

// ── Main Chatbot Component ────────────────────────────────────────────────────

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [chatError, setChatError] = useState<ChatError | null>(null);
  const [cooldown, setCooldown] = useState<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto Countdown Timer Effect for Rate Limits
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const { messages, sendMessage, status, regenerate } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    onError: (error) => {
      console.error('Chat error:', error);

      // 1. Offline / Network Error Check
      if (typeof window !== 'undefined' && !navigator.onLine) {
        setChatError({
          type: 'NETWORK',
          title: 'Connection Lost',
          message: 'You are currently offline. Please check your internet connection.',
        });
        return;
      }

      const rawMsg = error?.message || '';

      // 2. Rate Limit (429) Check
      if (
        rawMsg.includes('429') ||
        rawMsg.includes('Quota') ||
        rawMsg.includes('RATE_LIMIT') ||
        rawMsg.includes('traffic')
      ) {
        setCooldown(10);
        setChatError({
          type: 'RATE_LIMIT',
          title: 'System Busy',
          message: 'High traffic detected. Please wait for the cooldown timer before retrying.',
        });
        return;
      }

      // 3. Server Maintenance (503 / 500) Check
      if (
        rawMsg.includes('503') ||
        rawMsg.includes('500') ||
        rawMsg.includes('SERVER_ERROR')
      ) {
        setChatError({
          type: 'SERVER',
          title: 'Service Maintenance',
          message: 'Our AI engine is undergoing quick maintenance. Try again in a moment.',
        });
        return;
      }

      // 4. Fallback Generic Error
      setChatError({
        type: 'GENERIC',
        title: 'Unable to Respond',
        message: 'Something went wrong while fetching recommendations. Please try again.',
      });
    },
  });

  const isLoading = status !== 'ready';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatError]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading && cooldown === 0) {
      setChatError(null);
      sendMessage({ text: input });
      setInput('');
    }
  };

  // Error Card Visual Styling Helper
  const renderErrorCard = () => {
    if (!chatError) return null;

    let bgClass = 'bg-amber-50 border-amber-200 text-amber-900';
    let icon = <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />;

    if (chatError.type === 'NETWORK') {
      bgClass = 'bg-slate-50 border-slate-200 text-slate-800';
      icon = <WifiOff className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />;
    } else if (chatError.type === 'SERVER') {
      bgClass = 'bg-rose-50 border-rose-200 text-rose-900';
      icon = <ServerOff className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />;
    } else if (chatError.type === 'GENERIC') {
      bgClass = 'bg-gray-50 border-gray-200 text-gray-800';
      icon = <AlertCircle className="w-4 h-4 text-gray-600 shrink-0 mt-0.5" />;
    }

    return (
      <div className={`border rounded-2xl p-3 flex items-start gap-2.5 text-xs shadow-sm transition-all animate-in fade-in ${bgClass}`}>
        {icon}
        <div className="flex-1">
          <p className="font-semibold text-[11px] uppercase tracking-wide opacity-90">
            {chatError.title}
          </p>
          <p className="mt-0.5 leading-relaxed">{chatError.message}</p>

          <div className="mt-2.5 flex items-center gap-3">
            {cooldown > 0 ? (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                <Clock size={12} className="animate-spin" />
                Retry in {cooldown}s
              </span>
            ) : (
              <button
                onClick={() => {
                  setChatError(null);
                  regenerate();
                }}
                className="flex items-center gap-1 text-[11px] font-semibold underline hover:opacity-80 transition-opacity"
              >
                <RefreshCw size={11} /> Try Again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen && (
        <div
          className="bg-white w-[360px] sm:w-[400px] h-[560px] rounded-2xl shadow-2xl flex flex-col mb-4 overflow-hidden animate-in slide-in-from-bottom-5"
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
              onClick={() => setIsOpen(false)}
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
                      disabled={cooldown > 0}
                      onClick={() => {
                        setChatError(null);
                        sendMessage({ text: suggestion.replace(/^[^\w]+/, '') });
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
            {messages.map((m) => {
              const products = extractProductsFromParts(m.parts as any[]);
              const isUser = m.role === 'user';

              return (
                <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-2`}>
                  {(m.parts as any[]).map((part: any, index: number) => {
                    if (part.type === 'text' && part.text?.trim()) {
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
                          <div className="whitespace-pre-wrap leading-relaxed">{part.text}</div>
                        </div>
                      );
                    }

                    if (part.type === 'tool-invocation') {
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

                  {/* Product Cards */}
                  {!isUser && products.length > 0 && (
                    <div className="w-full space-y-2 mt-1">
                      <p
                        className="text-[10px] font-semibold uppercase tracking-wider px-1"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Recommended Products
                      </p>
                      {products.map((product) => (
                        <ProductCard key={product.id} product={product} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex items-start">
                <div
                  className="flex items-center gap-2 text-xs px-3 py-2 rounded-full"
                  style={{ background: '#FDF2F4', color: 'var(--rose-primary)' }}
                >
                  <Loader2 size={11} className="animate-spin" />
                  <span className="font-medium">Thinking...</span>
                </div>
              </div>
            )}

            {/* Structured Error Card */}
            {renderErrorCard()}

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
              disabled={cooldown > 0}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                cooldown > 0
                  ? `Please wait ${cooldown}s before retrying...`
                  : 'Ask for beauty recommendations...'
              }
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
              disabled={isLoading || !input.trim() || cooldown > 0}
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
          onClick={() => setIsOpen(true)}
          className="text-white p-4 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center relative"
          style={{ background: 'linear-gradient(135deg, #C06C84 0%, #e07a90 100%)' }}
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