import { Sparkles, Download } from 'lucide-react';

export default function MobilePromo() {
  const features = ['Foundation', 'Eyeliner', 'Skin Analysis', 'Save Looks'];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');

        .promo-card {
          font-family: 'DM Sans', sans-serif;
          position: relative;
          border-radius: 28px;
          overflow: hidden;
          padding: 40px 44px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 32px;
          background: #fff8f9;
          border: 1px solid rgba(192,108,132,0.12);
        }

        @media (max-width: 640px) {
          .promo-card { flex-direction: column; padding: 28px 24px; text-align: center; }
          .promo-features { justify-content: center; }
          .promo-right { width: 100%; align-items: center; }
        }

        /* Decorative — no blur, just soft radial shapes */
        .promo-accent {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
        }
        .promo-accent-1 {
          width: 320px; height: 320px;
          top: -100px; right: -80px;
          background: radial-gradient(circle at 40% 40%, rgba(231,166,180,0.22), transparent 70%);
        }
        .promo-accent-2 {
          width: 200px; height: 200px;
          bottom: -80px; left: 5%;
          background: radial-gradient(circle, rgba(252,228,236,0.35), transparent 65%);
        }

        .promo-left {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: flex-start;
          gap: 20px;
          flex: 1;
        }

        .promo-icon-ring {
          width: 52px; height: 52px;
          border-radius: 16px;
          background: linear-gradient(135deg, #fde8ef, #f4c0ce);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          border: 1px solid rgba(192,108,132,0.15);
        }

        .promo-text { flex: 1; }

        .promo-eyebrow {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #C06C84;
          margin-bottom: 7px;
        }

        .promo-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1.35rem, 2.4vw, 1.65rem);
          font-weight: 500;
          color: #1a1a1a;
          line-height: 1.18;
          margin: 0 0 10px;
          letter-spacing: -0.01em;
        }
        .promo-title em { font-style: italic; color: #C06C84; }

        .promo-desc {
          font-size: 12.5px;
          color: #9a8a8e;
          line-height: 1.7;
          max-width: 360px;
          margin: 0 0 16px;
          font-weight: 300;
        }

        .promo-features {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .promo-chip {
          font-size: 10.5px;
          font-weight: 500;
          color: #C06C84;
          background: rgba(192,108,132,0.07);
          border: 1px solid rgba(192,108,132,0.14);
          padding: 4px 11px;
          border-radius: 100px;
        }

        .promo-right {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 12px;
          flex-shrink: 0;
        }

        .promo-download-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #1a1214;
          color: #fff;
          border: none;
          padding: 13px 26px;
          border-radius: 100px;
          font-size: 13.5px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          letter-spacing: 0.02em;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .promo-download-btn:hover {
          background: #2a1e22;
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(26,18,20,0.2);
        }
        .promo-download-btn:active { transform: translateY(0); }

        .promo-btn-icon {
          width: 26px; height: 26px;
          background: rgba(255,255,255,0.1);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        .promo-note {
          font-size: 10.5px;
          color: #c0b0b8;
          font-weight: 400;
          letter-spacing: 0.03em;
          text-align: right;
        }
      `}</style>

      <div className="promo-card">
        <div className="promo-accent promo-accent-1" />
        <div className="promo-accent promo-accent-2" />

        {/* Left */}
        <div className="promo-left">
          <div className="promo-icon-ring">
            <Sparkles size={20} color="#C06C84" />
          </div>

          <div className="promo-text">
            <p className="promo-eyebrow">Mobile App</p>
            <h3 className="promo-title">
              More with Our <em>Mobile App</em>
            </h3>
            <p className="promo-desc">
              This web preview includes Lipstick &amp; Blush. The app unlocks
              real‑time AR rendering, skin analysis, and the full product library.
            </p>
            <div className="promo-features">
              {features.map((f) => (
                <span key={f} className="promo-chip">{f}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="promo-right">
          <button className="promo-download-btn">
            <div className="promo-btn-icon">
              <Download size={13} />
            </div>
            Download Free
          </button>
          <span className="promo-note">iOS &amp; Android</span>
        </div>
      </div>
    </>
  );
}