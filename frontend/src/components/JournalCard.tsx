import { useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import type { JournalEntry } from '../types'
import { fmtDateLong } from '../utils/format'

const EMOTIONS = ['Focado', 'Calmo', 'Ansioso', 'Confiante', 'Frustrado', 'Disciplinado', 'Impulsivo', 'Medo']
const ERRORS = ['Entrou sem setup', 'Não respeitou o stop', 'Aumentou o lote no prejuízo', 'Entrou cedo demais', 'Vingança após perda']

interface Props {
  entry?: JournalEntry | null
  defaultDate: string
  onSave: (data: Partial<JournalEntry>) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

export default function JournalCard({ entry, defaultDate, onSave, onDelete }: Props) {
  const [date, setDate] = useState(entry?.date ?? defaultDate)
  const [mood, setMood] = useState<number | null>(entry?.mood_score ?? null)
  const [discipline, setDiscipline] = useState<number | null>(entry?.discipline_rating ?? null)
  const [emotions, setEmotions] = useState<string[]>(entry?.emotions ?? [])
  const [errors, setErrors] = useState<string[]>(entry?.errors ?? [])
  const [lessons, setLessons] = useState(entry?.lessons ?? '')
  const [saving, setSaving] = useState(false)

  const toggle = (list: string[], set: (v: string[]) => void, item: string) =>
    set(list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({
        date,
        mood_score: mood,
        discipline_rating: discipline,
        emotions,
        errors,
        lessons,
      })
    } finally {
      setSaving(false)
    }
  }

  const Stars = ({ value, onChange }: { value: number | null; onChange: (v: number) => void }) => (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`h-5 w-3 rounded-sm text-[10px] leading-none transition-colors ${
            (value ?? 0) >= n ? 'bg-accent text-bg' : 'bg-surface-2 text-transparent hover:bg-surface-2'
          }`}
          aria-label={`Nota ${n}`}
        />
      ))}
    </div>
  )

  return (
    <form onSubmit={submit} className="card space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-sm font-semibold text-text capitalize">{fmtDateLong(date)}</h3>
        </div>
        <div className="flex gap-1">
          {onDelete && entry && (
            <button type="button" onClick={() => onDelete(entry.id)} className="rounded-md p-1.5 text-text-secondary hover:bg-down/10 hover:text-down" aria-label="Excluir entrada">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Data</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Humor (1-10)</label>
            <Stars value={mood} onChange={setMood} />
          </div>
          <div>
            <label className="label">Disciplina (1-10)</label>
            <Stars value={discipline} onChange={setDiscipline} />
          </div>
        </div>
      </div>

      <div>
        <label className="label">Emoções do dia</label>
        <div className="flex flex-wrap gap-1.5">
          {EMOTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => toggle(emotions, setEmotions, e)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                emotions.includes(e)
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border text-text-secondary hover:border-text-secondary/50 hover:text-text'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label flex items-center gap-1.5">
          <AlertTriangle size={13} className="text-accent" /> Erros de disciplina
        </label>
        <div className="flex flex-wrap gap-1.5">
          {ERRORS.map((er) => (
            <button
              key={er}
              type="button"
              onClick={() => toggle(errors, setErrors, er)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                errors.includes(er)
                  ? 'border-down bg-down/15 text-down'
                  : 'border-border text-text-secondary hover:border-text-secondary/50 hover:text-text'
              }`}
            >
              {er}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Lições do dia</label>
        <textarea className="input min-h-[70px] resize-y" value={lessons} onChange={(e) => setLessons(e.target.value)}
          placeholder="O que funcionou, o que vou mudar..." />
      </div>

      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Salvando...' : entry ? 'Salvar alterações' : 'Salvar diário'}
        </button>
      </div>
    </form>
  )
}
