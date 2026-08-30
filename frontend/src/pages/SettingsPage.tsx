import { useEffect, useState } from 'react'
import { Plus, Trash2, CheckCircle, Wallet, Settings as SettingsIcon, Tag } from 'lucide-react'
import { listAccounts, createAccount, activateAccount, deleteAccount, listOptions, createOption, deleteOption } from '../api/client'
import type { Account, CustomOption } from '../types'
import { fmtUSD } from '../utils/format'

export default function SettingsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [events, setEvents] = useState<CustomOption[]>([])
  const [contexts, setContexts] = useState<CustomOption[]>([])
  const [locations, setLocations] = useState<CustomOption[]>([])
  const [entryTypes, setEntryTypes] = useState<CustomOption[]>([])
  const [errorTypes, setErrorTypes] = useState<CustomOption[]>([])
  const [assets, setAssets] = useState<CustomOption[]>([])

  const [activeTab, setActiveTab] = useState<'accounts' | 'events' | 'contexts' | 'locations' | 'entries' | 'errors' | 'assets'>('accounts')

  // Forms
  const [accName, setAccName] = useState('')
  const [accCurrency, setAccCurrency] = useState('USD')
  const [accBalance, setAccBalance] = useState('10000')

  const [optCode, setOptCode] = useState('')
  const [optName, setOptName] = useState('')

  const reloadData = async () => {
    try {
      const [accs, evs, ctxs, locs, ent, err, ast] = await Promise.all([
        listAccounts(),
        listOptions('event'),
        listOptions('context'),
        listOptions('location'),
        listOptions('entry_type'),
        listOptions('error_type'),
        listOptions('asset'),
      ])
      setAccounts(accs)
      setEvents(evs)
      setContexts(ctxs)
      setLocations(locs)
      setEntryTypes(ent)
      setErrorTypes(err)
      setAssets(ast)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    reloadData()
  }, [])

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accName.trim()) return
    await createAccount({
      name: accName,
      currency: accCurrency,
      initial_balance: parseFloat(accBalance) || 0,
      is_active: accounts.length === 0,
    })
    setAccName('')
    setAccBalance('10000')
    reloadData()
  }

  const handleAddOption = async (category: string) => {
    if (!optName.trim()) return
    await createOption({
      category,
      code: optCode.trim() || undefined,
      name: optName.trim(),
    })
    setOptCode('')
    setOptName('')
    reloadData()
  }

  const handleActivateAcc = async (id: string) => {
    await activateAccount(id)
    reloadData()
  }

  const handleDeleteAcc = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta conta?')) {
      await deleteAccount(id)
      reloadData()
    }
  }

  const handleDeleteOpt = async (id: string) => {
    await deleteOption(id)
    reloadData()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-text">Configurações & Cadastros</h1>
        <p className="text-sm text-text-secondary">Gerencie suas contas de corretora, saldo e opções personalizadas para análise detalhada.</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {[
          { id: 'accounts', label: 'Contas & Saldo', icon: Wallet },
          { id: 'events', label: 'Eventos (G2, BF, BP...)', icon: Tag },
          { id: 'contexts', label: 'Contextos', icon: SettingsIcon },
          { id: 'locations', label: 'Localizações (VWAP, M20...)', icon: Tag },
          { id: 'entries', label: 'Formas de Entrada', icon: SettingsIcon },
          { id: 'errors', label: 'Cadastro de Erros', icon: Tag },
          { id: 'assets', label: 'Lista de Ativos', icon: Tag },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-accent text-bg font-semibold' : 'bg-surface-2 text-text-secondary hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content: Contas */}
      {activeTab === 'accounts' && (
        <div className="space-y-6">
          <form onSubmit={handleAddAccount} className="card flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-text-secondary">Nome da Conta / Corretora</label>
              <input
                type="text"
                placeholder="Ex: Conta Real Apex USD"
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                className="input w-full mt-1"
                required
              />
            </div>
            <div className="w-32">
              <label className="text-xs text-text-secondary">Moeda</label>
              <select value={accCurrency} onChange={(e) => setAccCurrency(e.target.value)} className="input w-full mt-1">
                <option value="USD">USD ($)</option>
                <option value="BRL">BRL (R$)</option>
              </select>
            </div>
            <div className="w-40">
              <label className="text-xs text-text-secondary">Saldo Inicial</label>
              <input
                type="number"
                step="0.01"
                value={accBalance}
                onChange={(e) => setAccBalance(e.target.value)}
                className="input w-full mt-1 font-mono"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary flex items-center gap-2">
              <Plus size={16} /> Adicionar Conta
            </button>
          </form>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((acc) => (
              <div key={acc.id} className={`card relative flex flex-col justify-between ${acc.is_active ? 'border-accent bg-accent/5' : ''}`}>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-display font-semibold text-text">{acc.name}</span>
                    {acc.is_active && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-accent">
                        <CheckCircle size={14} /> Ativa
                      </span>
                    )}
                  </div>
                  <div className="mt-3 space-y-1">
                    <div className="text-xs text-text-secondary">Saldo Atual: <span className="font-mono text-sm font-semibold text-text">{acc.currency === 'USD' ? fmtUSD(acc.current_balance) : `R$ ${acc.current_balance.toFixed(2)}`}</span></div>
                    <div className="text-xs text-text-secondary">Saldo Inicial: <span className="font-mono text-text">{acc.currency === 'USD' ? fmtUSD(acc.initial_balance) : `R$ ${acc.initial_balance.toFixed(2)}`}</span></div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 border-t border-border/50 pt-3">
                  {!acc.is_active && (
                    <button onClick={() => handleActivateAcc(acc.id)} className="btn btn-ghost text-xs text-accent">
                      Tornar Ativa
                    </button>
                  )}
                  {accounts.length > 1 && (
                    <button onClick={() => handleDeleteAcc(acc.id)} className="btn btn-ghost text-xs text-loss ml-auto">
                      <Trash2 size={14} /> Excluir
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Content: Opções Dinâmicas */}
      {activeTab !== 'accounts' && (
        <div className="space-y-6">
          <div className="card flex flex-wrap items-end gap-4">
            <div className="w-32">
              <label className="text-xs text-text-secondary">Código / Sigla</label>
              <input
                type="text"
                placeholder="Ex: BF"
                value={optCode}
                onChange={(e) => setOptCode(e.target.value)}
                className="input w-full mt-1 font-mono uppercase"
              />
            </div>
            <div className="flex-1 min-w-[240px]">
              <label className="text-xs text-text-secondary">Nome / Descrição</label>
              <input
                type="text"
                placeholder="Ex: Barras Fortes e Sólidas"
                value={optName}
                onChange={(e) => setOptName(e.target.value)}
                className="input w-full mt-1"
                required
              />
            </div>
            <button
              onClick={() => handleAddOption(
                activeTab === 'events' ? 'event' :
                activeTab === 'contexts' ? 'context' :
                activeTab === 'locations' ? 'location' :
                activeTab === 'entries' ? 'entry_type' :
                activeTab === 'errors' ? 'error_type' : 'asset'
              )}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus size={16} /> Cadastrar
            </button>
          </div>

          <div className="card divide-y divide-border">
            {(
              activeTab === 'events' ? events :
              activeTab === 'contexts' ? contexts :
              activeTab === 'locations' ? locations :
              activeTab === 'entries' ? entryTypes :
              activeTab === 'errors' ? errorTypes : assets
            ).map((opt) => (
              <div key={opt.id} className="flex items-center justify-between py-3 px-2">
                <div className="flex items-center gap-3">
                  {opt.code && <span className="rounded bg-surface-2 px-2 py-0.5 font-mono text-xs font-bold text-accent">{opt.code}</span>}
                  <span className="text-sm font-medium text-text">{opt.name}</span>
                </div>
                <button onClick={() => handleDeleteOpt(opt.id)} className="text-text-secondary hover:text-loss">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
