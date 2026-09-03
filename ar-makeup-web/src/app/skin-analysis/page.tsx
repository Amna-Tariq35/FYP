'use client';

import Link from 'next/link';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import {
  Sparkles,
  ClipboardList,
  CheckCircle2,
  ScanFace,
  Camera,
  ShieldCheck,
  Clock,
  BadgeCheck,
  Lock,
  ArrowRight,
  Wand2,
  FlaskConical,
  SunMoon,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Motion helpers                                                     */
/* ------------------------------------------------------------------ */

const staggerParent: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.05,
    },
  },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

/* ------------------------------------------------------------------ */
/*  Static content (unchanged information, same two options)           */
/* ------------------------------------------------------------------ */

const trustStats = [
  { icon: BadgeCheck, label: '100% Personalized' },
  { icon: FlaskConical, label: 'Board-Certified Logic' },
  { icon: ShieldCheck, label: 'Privacy Guaranteed' },
];

const questionnaireHighlights = [
  'Detailed concerns & sensitivity mapping',
  'Lifestyle & environment factors',
  'Exact actives synergy check',
];

const scanHighlights = [
  'Visual pore & redness detection',
  'Instant skin type classification',
  'Zero-storage privacy, always',
];

const steps = [
  {
    numeral: 'I',
    icon: Wand2,
    title: 'Choose your method',
    copy: 'Answer a guided questionnaire or let the camera read your skin in seconds — either path feeds the same engine.',
  },
  {
    numeral: 'II',
    icon: FlaskConical,
    title: 'AI ingredient matching',
    copy: 'Our synergy engine cross-checks actives, concentrations, and known conflicts against your unique profile.',
  },
  {
    numeral: 'III',
    icon: SunMoon,
    title: 'Get your AM/PM routine',
    copy: 'Receive a synchronized morning and evening routine, sequenced for maximum efficacy and zero irritation.',
  },
];

/* ------------------------------------------------------------------ */
/*  Small signature element — a rose hairline with a diamond mark      */
/* ------------------------------------------------------------------ */

function RoseDivider() {
  return (
    <div aria-hidden className="mx-auto flex w-full max-w-xs items-center gap-3">
      <span
        className="h-px flex-1"
        style={{
          background:
            'linear-gradient(to right, transparent, var(--rose-primary), transparent)',
          opacity: 0.5,
        }}
      />
      <span
        className="h-1.5 w-1.5 rotate-45"
        style={{ background: 'var(--rose-primary)' }}
      />
      <span
        className="h-px flex-1"
        style={{
          background:
            'linear-gradient(to right, transparent, var(--rose-primary), transparent)',
          opacity: 0.5,
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

export default function SkinAnalysisPage() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--bg-base)]">
      {/* Ambient rose glows */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-[var(--rose-soft)] opacity-40 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[28rem] w-[28rem] rounded-full bg-[var(--rose-primary)]/10 blur-3xl" />
        <div className="absolute bottom-0 -left-40 h-[24rem] w-[24rem] rounded-full bg-[var(--rose-soft)] opacity-30 blur-3xl" />
      </div>

      {/* ============================== HERO ============================== */}
      <section className="mx-auto max-w-5xl px-6 pt-24 pb-14 text-center sm:pt-32">
        <motion.div
          initial={shouldReduceMotion ? undefined : 'hidden'}
          animate={shouldReduceMotion ? undefined : 'show'}
          variants={staggerParent}
        >
          <motion.div
            variants={fadeUp}
            className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-white/70 px-4 py-1.5 text-xs font-medium tracking-wide text-[var(--text-secondary)] shadow-sm backdrop-blur-sm"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--rose-primary)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--rose-primary)]" />
            </span>
            AI Clinical Dermatology Engine
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="mx-auto max-w-3xl font-serif text-4xl font-semibold leading-[1.1] tracking-tight text-[var(--text-main)] sm:text-5xl md:text-6xl"
          >
            Discover Your <em className="text-[var(--rose-primary)] not-italic">Precise</em> Skin
            Profile
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg"
          >
            Our clinical-grade AI reads your skin barrier, sensitivity, and lifestyle signals to
            build a targeted profile — then prescribes a synchronized AM &amp; PM routine matched
            to exactly what your skin needs.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mx-auto mt-10 flex max-w-xl flex-wrap items-center justify-center gap-x-8 gap-y-4"
          >
            {trustStats.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-[var(--rose-primary)]" strokeWidth={2} />
                <span className="text-sm font-medium text-[var(--text-secondary)]">{label}</span>
              </div>
            ))}
          </motion.div>

          <motion.div variants={fadeUp} className="mt-10">
            <RoseDivider />
          </motion.div>
        </motion.div>
      </section>

      {/* ======================== SELECTION CARDS ========================= */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <motion.div
          initial={shouldReduceMotion ? undefined : 'hidden'}
          whileInView={shouldReduceMotion ? undefined : 'show'}
          viewport={{ once: true, amount: 0.2 }}
          variants={staggerParent}
          className="grid gap-6 md:grid-cols-2"
        >
          {/* ---------- CARD 1: Questionnaire ---------- */}
          <motion.div variants={fadeUp}>
            <Link href="/skin-analysis/questionnaire" className="group block h-full">
              <motion.div
                whileHover={shouldReduceMotion ? undefined : { y: -6 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="relative flex h-full flex-col rounded-3xl border border-[var(--border-soft)] bg-[var(--bg-section)] p-8 shadow-[0_10px_30px_-14px_color-mix(in_srgb,var(--rose-primary)_35%,transparent)] transition-shadow duration-300 group-hover:shadow-[0_24px_48px_-16px_color-mix(in_srgb,var(--rose-primary)_45%,transparent)]"
              >
                <div className="mb-6 flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--rose-soft)]">
                    <ClipboardList className="h-6 w-6 text-[var(--rose-primary)]" strokeWidth={1.75} />
                  </div>
                  <span className="ui-badge">Recommended</span>
                </div>

                <h2 className="font-serif text-2xl font-semibold text-[var(--text-main)]">
                  Comprehensive Skin Questionnaire
                </h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  A guided, in-depth intake for the most precise profile our engine can build.
                </p>

                <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
                  <Clock className="h-3.5 w-3.5" />
                  2–3 Minutes
                </div>

                <div className="ui-divider" />

                <ul className="flex-1 space-y-3">
                  {questionnaireHighlights.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-[var(--text-main)]">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--rose-primary)]" strokeWidth={2} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <div
                  className="mt-8 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-300 group-hover:shadow-md"
                  style={{
                    background: 'var(--rose-primary)',
                    border: '1px solid color-mix(in srgb, var(--rose-primary) 65%, black)',
                  }}
                >
                  Start Questionnaire
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </div>
              </motion.div>
            </Link>
          </motion.div>

          {/* ---------- CARD 2: Photo Scan (deep rosewood, on-theme) ---------- */}
          <motion.div variants={fadeUp}>
            <Link href="/skin-analysis/scan" className="group block h-full">
              <motion.div
                whileHover={shouldReduceMotion ? undefined : { y: -6 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="relative flex h-full flex-col overflow-hidden rounded-3xl p-8 shadow-[0_10px_36px_-12px_color-mix(in_srgb,var(--rose-primary)_55%,transparent)] transition-shadow duration-300 group-hover:shadow-[0_28px_56px_-16px_color-mix(in_srgb,var(--rose-primary)_65%,transparent)]"
                style={{
                  background:
                    'linear-gradient(160deg, color-mix(in srgb, var(--rose-primary) 62%, black) 0%, color-mix(in srgb, var(--rose-primary) 88%, black) 100%)',
                }}
              >
                {/* ambient rose wash */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-70"
                  style={{
                    background:
                      'radial-gradient(120% 100% at 100% 0%, var(--rose-soft) 0%, transparent 55%)',
                    mixBlendMode: 'overlay',
                  }}
                />

                <div className="relative mb-6 flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
                    <ScanFace className="h-6 w-6 text-white" strokeWidth={1.75} />
                  </div>
                  <span className="relative inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-white backdrop-blur-sm">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--rose-soft)] opacity-80" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--rose-soft)]" />
                    </span>
                    AI Instant Scan
                  </span>
                </div>

                <h2 className="relative font-serif text-2xl font-semibold text-white">
                  Instant AI Photo Analysis
                </h2>
                <p className="relative mt-2 text-sm text-white/75">
                  Let the camera map your skin in real time — no forms, no guesswork.
                </p>

                <div className="relative mt-4 flex items-center gap-1.5 text-xs font-medium text-white/65">
                  <Clock className="h-3.5 w-3.5" />
                  &lt; 30 Seconds
                </div>

                {/* Animated scanner frame preview */}
                <div className="relative mt-6 flex h-28 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/5">
                  <div className="relative h-16 w-16">
                    <span className="absolute left-0 top-0 h-4 w-4 rounded-tl-md border-l-2 border-t-2 border-[var(--rose-soft)]" />
                    <span className="absolute right-0 top-0 h-4 w-4 rounded-tr-md border-r-2 border-t-2 border-[var(--rose-soft)]" />
                    <span className="absolute bottom-0 left-0 h-4 w-4 rounded-bl-md border-b-2 border-l-2 border-[var(--rose-soft)]" />
                    <span className="absolute bottom-0 right-0 h-4 w-4 rounded-br-md border-b-2 border-r-2 border-[var(--rose-soft)]" />
                    <ScanFace className="absolute inset-0 m-auto h-7 w-7 text-white/85" strokeWidth={1.5} />
                  </div>
                  {!shouldReduceMotion && (
                    <motion.div
                      aria-hidden
                      className="absolute inset-x-3 h-[2px]"
                      style={{
                        background:
                          'linear-gradient(to right, transparent, var(--rose-soft), transparent)',
                      }}
                      animate={{ top: ['12%', '85%', '12%'] }}
                      transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}
                </div>

                <ul className="relative mt-6 flex-1 space-y-3">
                  {scanHighlights.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-white/85">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--rose-soft)]" strokeWidth={2} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="relative mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold shadow-lg transition-transform duration-300 group-hover:scale-[1.02]" style={{ color: 'color-mix(in srgb, var(--rose-primary) 88%, black)' }}>
                  <Camera className="h-4 w-4" />
                  Upload Photo &amp; Scan
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </div>
              </motion.div>
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* ========================= HOW IT WORKS =========================== */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <motion.div
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 16 }}
          whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--rose-primary)]">
            <Sparkles className="h-3.5 w-3.5" />
            How it works
          </span>
          <h2 className="mt-3 font-serif text-3xl font-semibold text-[var(--text-main)] sm:text-4xl">
            From scan to routine, in one flow
          </h2>
        </motion.div>

        <motion.div
          initial={shouldReduceMotion ? undefined : 'hidden'}
          whileInView={shouldReduceMotion ? undefined : 'show'}
          viewport={{ once: true, amount: 0.2 }}
          variants={staggerParent}
          className="relative mt-14 grid gap-10 sm:grid-cols-3"
        >
          {/* connecting hairline */}
          <div
            aria-hidden
            className="absolute left-0 right-0 top-6 hidden h-px sm:block"
            style={{
              background:
                'linear-gradient(to right, transparent, var(--rose-soft), var(--rose-soft), transparent)',
            }}
          />

          {steps.map((step) => (
            <motion.div key={step.title} variants={fadeUp} className="relative text-center">
              <div className="relative z-10 mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-section)] shadow-sm">
                <step.icon className="h-5 w-5 text-[var(--rose-primary)]" strokeWidth={1.75} />
              </div>
              <div className="mt-5 font-serif text-sm italic tracking-wide text-[var(--rose-primary)]">
                {step.numeral}
              </div>
              <h3 className="mt-1.5 font-serif text-lg font-semibold text-[var(--text-main)]">
                {step.title}
              </h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-[var(--text-secondary)]">
                {step.copy}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ========================= TRUST BANNER =========================== */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <motion.div
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 12 }}
          whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--border-soft)] bg-[var(--rose-soft)]/50 px-6 py-6 text-center sm:flex-row sm:justify-center sm:gap-4 sm:text-left"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
            <Lock className="h-4.5 w-4.5 text-[var(--rose-primary)]" strokeWidth={2} />
          </div>
          <p className="text-sm text-[var(--text-main)]">
            <span className="font-semibold">Your privacy matters.</span>{' '}
            <span className="text-[var(--text-secondary)]">
              Uploaded photos are processed instantly in memory and are never stored or shared.
            </span>
          </p>
        </motion.div>
      </section>
    </main>
  );
}