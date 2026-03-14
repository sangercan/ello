import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { ArrowRight, Lock, KeyRound } from 'lucide-react'
import api from '@services/api'
import BrandMark from '@/components/BrandMark'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = (searchParams.get('token') || '').trim()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token) {
      toast.error('Link invalido de redefinicao.')
      return
    }
    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      toast.error('As senhas nao conferem.')
      return
    }

    setLoading(true)
    try {
      await api.resetPassword(token, password)
      setDone(true)
      toast.success('Senha redefinida com sucesso.')
      setTimeout(() => navigate('/login'), 1200)
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Falha ao redefinir senha.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-10 w-72 h-72 bg-purple-600/20 rounded-full blur-3xl opacity-45 animate-pulse" />
        <div className="absolute bottom-20 left-10 w-80 h-80 bg-indigo-600/20 rounded-full blur-3xl opacity-40 animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          <Link to="/login" className="inline-flex items-center gap-2 text-gray-400 hover:text-primary transition mb-6">
            <ArrowRight className="rotate-180" size={18} />
            <span>Voltar para login</span>
          </Link>

          <div className="bg-gradient-to-br from-slate-900/60 to-slate-800/60 backdrop-blur-xl rounded-2xl p-8 border border-slate-700/50 shadow-2xl">
            <BrandMark className="mb-4" iconClassName="w-9 h-9 rounded-xl" textClassName="text-2xl font-bold text-primary" />
            <h1 className="text-2xl font-bold text-primary">Nova senha</h1>
            <p className="text-gray-400 mt-2">
              Escolha sua nova senha para acessar sua conta Ello Social.
            </p>

            {!token && (
              <div className="mt-5 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                Link de redefinicao invalido. Solicite um novo link em "Esqueci minha senha".
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                  Nova senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 text-gray-500" size={18} />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite sua nova senha"
                    className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:bg-slate-700/70 transition"
                    disabled={loading || done || !token}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-300 mb-2">
                  Confirmar nova senha
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3.5 text-gray-500" size={18} />
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita sua nova senha"
                    className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:bg-slate-700/70 transition"
                    disabled={loading || done || !token}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || done || !token}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Salvando...' : done ? 'Senha atualizada' : 'Atualizar senha'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
