import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../utils/api'

const GROUNDING = [
  ['5', 'SEE',   'Name 5 things you can see'],
  ['4', 'TOUCH', 'Name 4 things you can touch'],
  ['3', 'HEAR',  'Name 3 things you can hear'],
  ['2', 'SMELL', 'Name 2 things you can smell'],
  ['1', 'TASTE', 'Name 1 thing you can taste'],
]

export default function CrisisPage({ standalone }) {
  const [resources, setResources] = useState([])

  useEffect(() => {
    api.get('/crisis/resources').then(r => setResources(r.data)).catch(() => {})
  }, [])

  return (
    <div className={standalone ? 'min-h-screen bg-slate-50' : ''}>
      <div className="p-6 max-w-2xl mx-auto">
        {/* Emergency banner */}
        <div className="bg-red-600 text-white rounded-2xl p-7 text-center mb-6">
          <h1 className="text-2xl font-bold mb-1">Crisis Support</h1>
          <p className="text-red-100 text-sm mb-5">If you or someone else is in immediate danger</p>
          <a href="tel:999"
            className="bg-white text-red-700 font-bold text-2xl rounded-xl py-3 px-8 inline-block">
            Call 999 now
          </a>
        </div>

        <div className="alert-warning mb-6">
          <strong>You are not alone.</strong> Reaching out takes courage. These resources are confidential and available right now.
        </div>

        {/* Hotlines */}
        {resources.map(region => (
          <div key={region.country} className="mb-6">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">{region.country}</p>
            <div className="space-y-2.5">
              {region.resources.map(r => (
                <div key={r.name} className="card p-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm text-slate-700">{r.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{r.available}</div>
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noreferrer"
                        className="text-xs text-brand-600 hover:underline mt-1 block">
                        Visit website →
                      </a>
                    )}
                  </div>
                  {r.phone && (
                    <a href={`tel:${r.phone.replace(/\s/g,'')}`} className="btn-danger btn-sm shrink-0 gap-1.5">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 6.75Z" />
                      </svg>
                      {r.phone}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Grounding technique */}
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-5 mt-2">
          <h2 className="font-bold text-brand-700 mb-2">5-4-3-2-1 Grounding Technique</h2>
          <p className="text-sm text-brand-600 mb-3">If you feel overwhelmed right now, try this:</p>
          <div className="space-y-2">
            {GROUNDING.map(([num, sense, text]) => (
              <div key={num} className="flex gap-3 text-sm text-brand-700">
                <span className="font-bold w-4">{num}.</span>
                <span>{text} (<strong>{sense}</strong>)</span>
              </div>
            ))}
          </div>
        </div>

        {standalone && (
          <div className="text-center mt-6">
            <Link to="/login" className="text-sm text-slate-500 hover:underline">← Back to MindBridge</Link>
          </div>
        )}
      </div>
    </div>
  )
}
