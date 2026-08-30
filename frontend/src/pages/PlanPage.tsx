import { BookOpen, ListChecks, Target } from 'lucide-react'

export default function PlanPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-text">Planejamento do dia</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Planeje antes do mercado abrir e faça o review depois — em breve.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          {
            icon: Target,
            title: 'Cenários pré-mercado',
            desc: 'Defina os cenários de abertura (tendência, lateral, rompimento) e os níveis-chave do dia antes de operar.',
          },
          {
            icon: ListChecks,
            title: 'Metas e limites',
            desc: 'Meta de P&L, número máximo de operações e o valor que você para o dia (ganhando ou perdendo).',
          },
          {
            icon: BookOpen,
            title: 'Review pós-mercado',
            desc: 'Compare o plano com o que aconteceu: seguiu o setup? Respeitou os limites? O que vai mudar amanhã?',
          },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="card p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Icon size={20} />
            </div>
            <h3 className="font-display text-sm font-semibold text-text">{title}</h3>
            <p className="mt-1.5 text-sm text-text-secondary">{desc}</p>
          </div>
        ))}
      </div>

      <div className="card p-6 text-center">
        <p className="text-sm text-text-secondary">
          O planejamento do dia está na Fase 2 — registre seus trades e o diário emocional enquanto isso.
        </p>
      </div>
    </div>
  )
}
