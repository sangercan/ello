import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Lock, User, ArrowRight } from 'lucide-react'
import { toast } from 'react-hot-toast'

import { useAdminAuthStore } from '@store/adminAuthStore'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const login = useAdminAuthStore((state) => state.login)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      toast.error('Preencha usuário e senha')
      return
    }

    setLoading(true)
    try {
      await login(username, password)
      toast.success('Acesso administrativo liberado')
      navigate('/painel')
    } catch (error: any) {
      const message = error?.response?.data?.detail || error?.message || 'Falha ao autenticar no painel'
      toast.error(String(message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-cyan-500/30 bg-slate-900/80 backdrop-blur p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-cyan-500/20 flex items-center justify-center">
            <Shield className="w-7 h-7 text-cyan-300" />
          </div>
          <h1 className="text-2xl font-bold">Painel Administrativo</h1>
          <p className="text-sm text-slate-400 mt-2">Acesso exclusivo para administradores do sistema</p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm text-slate-300 mb-2 block">Usuário administrativo</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-cyan-400"
                placeholder="seu usuario"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-slate-300 mb-2 block">Senha</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-cyan-400"
                placeholder="********"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cyan-500 text-slate-950 font-semibold py-2.5 rounded-lg hover:bg-cyan-400 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? 'Entrando...' : <>Entrar no painel <ArrowRight className="w-4 h-4" /></>}
          </button>
        </form>
      </div>
    </div>
  )
}
