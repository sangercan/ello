import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Activity, AlertTriangle, Shield, Users, UserPlus, LogOut, RefreshCcw, Signal } from 'lucide-react'
import { toast } from 'react-hot-toast'

import { adminService, type AdminMetrics, type AdminUser } from '@services/adminApi'
import { useAdminAuthStore } from '@store/adminAuthStore'

const fmtHour = (value: string) => {
  try {
    const d = new Date(value)
    return `${String(d.getHours()).padStart(2, '0')}:00`
  } catch {
    return value
  }
}

export default function AdminPanelPage() {
  const { user, logout } = useAdminAuthStore()
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [panelUsers, setPanelUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newUser, setNewUser] = useState({
    full_name: '',
    username: '',
    email: '',
    password: '',
    is_panel_admin: true,
    is_panel_active: true,
  })

  const topTraffic = useMemo(() => (metrics?.traffic_24h || []).slice(-8), [metrics])

  const load = async () => {
    setLoading(true)
    try {
      const [m, users] = await Promise.all([
        adminService.metrics(),
        adminService.listPanelUsers(true),
      ])
      setMetrics(m)
      setPanelUsers(users)
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error?.message || 'Falha ao carregar painel'
      toast.error(String(msg))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const onCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUser.full_name || !newUser.username || !newUser.email || !newUser.password) {
      toast.error('Preencha todos os campos do novo usuário administrativo')
      return
    }

    setCreating(true)
    try {
      await adminService.createPanelUser(newUser)
      toast.success('Usuário administrativo criado')
      setNewUser({
        full_name: '',
        username: '',
        email: '',
        password: '',
        is_panel_admin: true,
        is_panel_active: true,
      })
      await load()
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error?.message || 'Não foi possível criar o usuário'
      toast.error(String(msg))
    } finally {
      setCreating(false)
    }
  }

  const toggleAdmin = async (target: AdminUser) => {
    try {
      await adminService.updatePanelUser(target.id, {
        is_panel_admin: !target.is_panel_admin,
      })
      toast.success('Permissão administrativa atualizada')
      await load()
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Falha ao atualizar permissão')
    }
  }

  const toggleActive = async (target: AdminUser) => {
    try {
      await adminService.updatePanelUser(target.id, {
        is_panel_active: !target.is_panel_active,
      })
      toast.success('Status de acesso atualizado')
      await load()
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Falha ao atualizar status')
    }
  }

  const doLogout = () => {
    logout()
    window.location.href = '/painel/login'
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Painel de Administração</h1>
            <p className="text-slate-400 mt-1">Monitoramento operacional e gestão de administradores</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs md:text-sm text-slate-300 bg-slate-800 border border-slate-700 px-3 py-2 rounded-lg">
              Logado como: {user?.username}
            </span>
            <button onClick={load} className="p-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700" title="Atualizar">
              <RefreshCcw className="w-4 h-4" />
            </button>
            <button onClick={doLogout} className="p-2 bg-red-500/20 border border-red-500/40 rounded-lg hover:bg-red-500/30" title="Sair">
              <LogOut className="w-4 h-4 text-red-200" />
            </button>
          </div>
        </header>

        {loading ? (
          <div className="h-56 flex items-center justify-center border border-slate-800 rounded-2xl bg-slate-900/50">
            <div className="w-8 h-8 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <MetricCard icon={<Users className="w-5 h-5 text-cyan-300" />} title="Usuários totais" value={metrics?.summary.total_users || 0} />
              <MetricCard icon={<Activity className="w-5 h-5 text-emerald-300" />} title="Online agora" value={metrics?.summary.online_users || 0} />
              <MetricCard icon={<Signal className="w-5 h-5 text-amber-300" />} title="Mensagens 24h" value={metrics?.summary.messages_24h || 0} />
              <MetricCard icon={<Shield className="w-5 h-5 text-violet-300" />} title="Usuários de painel" value={metrics?.summary.total_panel_users || 0} />
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <h2 className="text-lg font-semibold mb-4">Tráfego nas últimas horas</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {topTraffic.length === 0 ? (
                    <p className="text-slate-400">Sem eventos recentes.</p>
                  ) : topTraffic.map((p) => (
                    <div key={`${p.hour}-${p.events}`} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                      <p className="text-xs text-slate-400">{fmtHour(p.hour)}</p>
                      <p className="text-lg font-semibold text-cyan-300">{p.events}</p>
                      <p className="text-xs text-slate-500">eventos</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-300" />
                  Pontos de tensão
                </h2>
                <div className="space-y-2">
                  {(metrics?.tension_points || []).map((point) => (
                    <div key={`${point.hour}-${point.events}`} className="flex items-center justify-between text-sm border border-slate-800 rounded-lg px-3 py-2">
                      <span className="text-slate-300">{fmtHour(point.hour)}</span>
                      <span className="font-semibold text-amber-300">{point.events}</span>
                    </div>
                  ))}
                </div>
                {metrics?.peak_hour ? (
                  <p className="mt-4 text-xs text-slate-400">
                    Pico principal: <span className="text-cyan-300">{fmtHour(metrics.peak_hour.hour)}</span> com <span className="text-cyan-300">{metrics.peak_hour.events}</span> eventos.
                  </p>
                ) : null}
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-cyan-300" />
                  Criar usuário do painel
                </h2>
                <form className="space-y-3" onSubmit={onCreateUser}>
                  <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2" placeholder="Nome completo" value={newUser.full_name} onChange={(e) => setNewUser((p) => ({ ...p, full_name: e.target.value }))} />
                  <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2" placeholder="Username" value={newUser.username} onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))} />
                  <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2" placeholder="Email" value={newUser.email} onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))} />
                  <input type="password" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2" placeholder="Senha (min 8)" value={newUser.password} onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))} />

                  <div className="flex items-center gap-6 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={newUser.is_panel_admin} onChange={(e) => setNewUser((p) => ({ ...p, is_panel_admin: e.target.checked }))} />
                      Admin
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={newUser.is_panel_active} onChange={(e) => setNewUser((p) => ({ ...p, is_panel_active: e.target.checked }))} />
                      Ativo
                    </label>
                  </div>

                  <button disabled={creating} className="w-full bg-cyan-500 text-slate-950 font-semibold py-2.5 rounded-lg hover:bg-cyan-400 disabled:opacity-60">
                    {creating ? 'Criando...' : 'Criar usuário administrativo'}
                  </button>
                </form>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <h2 className="text-lg font-semibold mb-4">Gerenciar administradores</h2>
                <div className="space-y-3 max-h-[420px] overflow-auto pr-1">
                  {panelUsers.map((u) => (
                    <div key={u.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{u.full_name}</p>
                          <p className="text-xs text-slate-400">@{u.username} • {u.email}</p>
                        </div>
                        <div className="text-xs text-slate-400">#{u.id}</div>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => toggleAdmin(u)}
                          className={`px-2.5 py-1.5 rounded text-xs border ${u.is_panel_admin ? 'border-violet-400/60 text-violet-200 bg-violet-500/10' : 'border-slate-600 text-slate-300'}`}
                        >
                          {u.is_panel_admin ? 'Admin: Sim' : 'Admin: Não'}
                        </button>
                        <button
                          onClick={() => toggleActive(u)}
                          className={`px-2.5 py-1.5 rounded text-xs border ${u.is_panel_active ? 'border-emerald-400/60 text-emerald-200 bg-emerald-500/10' : 'border-red-500/50 text-red-200 bg-red-500/10'}`}
                        >
                          {u.is_panel_active ? 'Ativo' : 'Bloqueado'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function MetricCard({ icon, title, value }: { icon: ReactNode; title: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{title}</p>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-bold">{value}</p>
    </div>
  )
}
