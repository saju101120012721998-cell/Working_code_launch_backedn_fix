import React, {useEffect, useState} from 'react'
import { api } from '../../api/client'

export default function MetricsRow({session}){
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const sessionId = session?.project_summary?.session_id ?? session?.session_id ?? ''

  useEffect(()=>{
    let mounted = true

    if(!sessionId){
      setMetrics(null)
      setError(new Error('Missing session id'))
      setLoading(false)
      return ()=>{ mounted = false }
    }

    setLoading(true)
    setError(null)
    api.metrics(sessionId)
      .then((m)=>{
        if(!mounted) return
        setMetrics(m ?? null)
        setLoading(false)
      })
      .catch((err)=>{
        if(!mounted) return
        setError(err)
        setLoading(false)
      })

    return ()=>{ mounted = false }
  }, [sessionId])

  if(loading){
    return (
      <>
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Completion %</div>
          <div className="mt-3 text-2xl font-semibold text-white">—</div>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Remaining effort</div>
          <div className="mt-3 text-2xl font-semibold text-white">—</div>
        </div>
      </>
    )
  }

  if(error || !metrics){
    return (
      <>
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Completion %</div>
          <div className="mt-3 text-2xl font-semibold text-white">—</div>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Remaining effort</div>
          <div className="mt-3 text-2xl font-semibold text-white">—</div>
        </div>
      </>
    )
  }

  const metricsData = metrics && typeof metrics === 'object' ? metrics : null
  const completionPct =
    metricsData && typeof metricsData.completion_pct === 'number'
      ? Math.round(metricsData.completion_pct * 100)
      : (metricsData && typeof metricsData.completion_percentage === 'number'
          ? Math.round(metricsData.completion_percentage)
          : null)
  const remainingHours =
    metricsData && typeof metricsData.remaining_effort_hours === 'number'
      ? metricsData.remaining_effort_hours
      : null
  const personDays = remainingHours !== null ? Math.round((remainingHours / 8) * 10) / 10 : null

  return (
    <>
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
        <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Completion %</div>
        <div className="mt-3 text-2xl font-semibold text-white">{completionPct !== null ? `${completionPct}%` : '—'}</div>
      </div>
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
        <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Remaining effort</div>
        <div className="mt-3 text-2xl font-semibold text-white">{remainingHours !== null ? `${remainingHours}h` : '—'}{personDays !== null ? ` (~${personDays} pd)` : ''}</div>
      </div>
    </>
  )
}
