import { useRef, useState } from 'react'
import { FileUp, X } from 'lucide-react'
import { importConfirm, importPreview } from '../api/client'
import type { ImportPreview as PreviewData } from '../types'
import { fmtBRL, fmtDate, pnlClass } from '../utils/format'

const fmtName = (name: string) => (name === 'profitpro' ? 'Profit Pro' : name === 'metatrader' ? 'MetaTrader' : name)

interface Props {
  open: boolean
  onClose: () => void
  onImported: (created: number) => void
}

export default function ImportModal({ open, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  if (!open) return null

  const reset = () => {
    setPreview(null)
    setLoading(false)
    setError('')
    setConfirmed(false)
  }

  const close = () => {
    reset()
    onClose()
  }

  const handleFile = async (file: File) => {
    setLoading(true)
    setError('')
    setPreview(null)
    try {
      const res = await importPreview(file)
      setPreview(res.preview)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao ler o arquivo.')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!preview) return
    setLoading(true)
    setError('')
    try {
      const res = await importConfirm(preview.preview_id)
      setConfirmed(true)
      onImported(res.created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao confirmar a importação.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={close} />
      <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-base font-semibold text-text">Importar operações</h2>
          <button onClick={close} className="p-1 text-text-secondary hover:text-text" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4">
          {confirmed ? (
            <div className="text-center py-8">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-up/15 text-up">
                ✓
              </div>
              <p className="font-medium text-text">Importação concluída!</p>
              <p className="mt-1 text-sm text-text-secondary">As operações já estão no seu diário.</p>
              <button className="btn btn-primary mt-5" onClick={close}>Fechar</button>
            </div>
          ) : preview ? (
            <PreviewPanel
              preview={preview}
              loading={loading}
              onConfirm={handleConfirm}
              onBack={() => setPreview(null)}
            />
          ) : (
            <UploadPanel fileRef={fileRef} loading={loading} error={error} onFile={handleFile} />
          )}
        </div>
      </div>
    </div>
  )
}

function UploadPanel({ fileRef, loading, error, onFile }: {
  fileRef: React.RefObject<HTMLInputElement>
  loading: boolean
  error: string
  onFile: (f: File) => void
}) {
  return (
    <div>
      <div
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface-2/50 px-6 py-10 text-center transition-colors hover:border-accent/60"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files?.[0]
          if (f) onFile(f)
        }}
      >
        <FileUp size={32} className="text-accent" />
        <p className="mt-3 font-medium text-text">Arraste o CSV ou clique para selecionar</p>
        <p className="mt-1 text-xs text-text-secondary">Exportação do Profit Pro (Ativo;Data;Hora;...) ou MetaTrader (Symbol;Open_time;...)</p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
            e.target.value = ''
          }}
        />
      </div>
      {loading && <p className="mt-3 text-center text-sm text-text-secondary">Lendo arquivo...</p>}
      {error && <p className="mt-3 rounded-lg bg-down/10 px-3 py-2 text-sm text-down">{error}</p>}
    </div>
  )
}

function PreviewPanel({ preview, loading, onConfirm, onBack }: {
  preview: PreviewData
  loading: boolean
  onConfirm: () => void
  onBack: () => void
}) {
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Info label="Formato" value={fmtName(preview.format)} />
        <Info label="Operações" value={String(preview.total_trades)} />
        <Info label="Ignoradas" value={String(preview.skipped)} valueClass={preview.skipped ? 'text-accent' : 'text-text'} />
        <Info label="P&L previsto" value={fmtBRL(preview.total_pnl_preview)} valueClass={pnlClass(preview.total_pnl_preview)} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-[11px] uppercase tracking-wider text-text-secondary">
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Hora</th>
              <th className="px-3 py-2">Ativo</th>
              <th className="px-3 py-2">Dir.</th>
              <th className="px-3 py-2 text-right">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {preview.sample.map((t, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{fmtDate(t.date!)}</td>
                <td className="px-3 py-2 font-mono text-xs text-text-secondary">{t.time ?? '—'}</td>
                <td className="px-3 py-2">{t.asset}</td>
                <td className="px-3 py-2">
                  <span className={`badge ${t.direction === 'LONG' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                    {t.direction}
                  </span>
                </td>
                <td className={`px-3 py-2 text-right font-mono text-xs ${pnlClass(t.result ?? 0)}`}>
                  {fmtBRL(t.result ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview.sample.length < preview.total_trades && (
        <p className="mt-2 text-xs text-text-secondary">Exibindo {preview.sample.length} de {preview.total_trades} operações.</p>
      )}
      {preview.skipped > 0 && (
        <p className="mt-2 text-xs text-accent">{preview.skipped} linha(s) sem data, ativo ou resultado foram ignoradas.</p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onBack}>Trocar arquivo</button>
        <button className="btn btn-primary" onClick={onConfirm} disabled={loading || preview.total_trades === 0}>
          {loading ? 'Importando...' : `Importar ${preview.total_trades} operações`}
        </button>
      </div>
    </div>
  )
}

function Info({ label, value, valueClass = 'text-text' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="text-[10px] uppercase tracking-wider text-text-secondary">{label}</div>
      <div className={`mt-1 font-mono text-sm font-semibold ${valueClass}`}>{value}</div>
    </div>
  )
}
