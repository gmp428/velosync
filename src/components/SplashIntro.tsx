import { useEffect, useRef, useState, type AnimationEvent, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { IntroMode } from '../lib/intro'

const MARK_SRC = `${import.meta.env.BASE_URL}logos/velosync-vs-mark-on-dark.png`
const WORD_SRC = `${import.meta.env.BASE_URL}logos/velosync-wordmark-on-dark.png`
const LOCKUP_SRC = `${import.meta.env.BASE_URL}logos/velosync-lockup-on-dark.png`

/** Wordmark PNG width / height, and home-plate mark width / height. */
const WORD_ASPECT = 1147 / 400
const MARK_ASPECT = 956 / 918

type Layout = {
  wide: number
  wordH: number
  markH: number
  expandH: number
}

function measure(vw: number): Layout {
  const wide = Math.round(Math.min(540, Math.max(280, vw - 28)))
  const inner = wide - 36
  const wordH = Math.max(58, Math.round((inner - 10) / (MARK_ASPECT * 1.12 + WORD_ASPECT)))
  const markH = Math.round(wordH * 1.12)
  return {
    wide,
    wordH,
    markH,
    expandH: markH + 36,
  }
}

function useLayout(): Layout {
  const [layout, setLayout] = useState(() => measure(window.innerWidth))
  useEffect(() => {
    const onResize = () => setLayout(measure(window.innerWidth))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return layout
}

function Field({ children }: { children: ReactNode }) {
  return (
    <div className="splash-field" aria-hidden="true">
      <div className="splash-sky" />
      <div className="splash-bokeh">
        <span className="bokeh b1" />
        <span className="bokeh b2" />
        <span className="bokeh b3" />
        <span className="bokeh b4" />
        <span className="bokeh b5" />
      </div>
      {children}
    </div>
  )
}

function StaticA({ onDone }: { onDone: () => void }) {
  const layout = useLayout()
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const reduce = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  ).current
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    if (!reduce) return
    const fadeAt = window.setTimeout(() => setLeaving(true), 2700)
    const doneAt = window.setTimeout(() => onDoneRef.current(), 3000)
    return () => {
      window.clearTimeout(fadeAt)
      window.clearTimeout(doneAt)
    }
  }, [reduce])

  const finish = (event: AnimationEvent<HTMLDivElement>) => {
    if (reduce) return
    if (event.target !== event.currentTarget) return
    if (event.animationName !== 'splash-fade') return
    onDoneRef.current()
  }

  const style = {
    '--badge-wide': `${layout.wide}px`,
    '--word-h': `${layout.wordH}px`,
    '--mark-h': `${layout.markH}px`,
    '--expand-h': `${layout.expandH}px`,
  } as CSSProperties

  return (
    <div
      className={`splash splash-motion${reduce ? ' is-reduced' : ''}${leaving ? ' is-leaving' : ''}`}
      style={style}
      onAnimationEnd={finish}
      role="presentation"
    >
      <Field>
        <div className="splash-stage">
          <div className="splash-halo" />
          <div className="splash-badge">
            <div className="splash-row">
              <img className="splash-mark" src={MARK_SRC} alt="" draggable={false} fetchPriority="high" />
              <span className="splash-word">
                <img src={WORD_SRC} alt="" draggable={false} />
              </span>
            </div>
          </div>
        </div>
      </Field>
    </div>
  )
}

function StaticB({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div className="splash splash-static-b" role="dialog" aria-label="VeloSync">
      <Field>
        <div className="splash-b-stack">
          <div className="splash-banner">
            <img src={LOCKUP_SRC} alt="VeloSync. Track. Analyze. Elevate." />
          </div>
          <button type="button" className="splash-continue" onClick={onDone}>
            Continue
          </button>
        </div>
      </Field>
    </div>
  )
}

export default function SplashIntro({ mode, onDone }: { mode: IntroMode; onDone: () => void }) {
  const node = mode === 'b' ? <StaticB onDone={onDone} /> : <StaticA onDone={onDone} />
  return createPortal(node, document.body)
}
