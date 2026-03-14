import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { ArrowRight, Mail, Send } from 'lucide-react'
import api from '@services/api'

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = identifier.trim()
    if (!value) {
      toast.error('Informe seu email ou usuario')
      return
    }

    setLoading(true)
    try {
      await api.requestPasswordReset(value)
      setSent(true)
      toast.success('Se a conta existir, enviaremos instrucoes por email.')
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Falha ao solicitar redefinicao.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-16 left-8 w-72 h-72 bg-blue-600/20 rounded-full blur-3xl opacity-50 animate-pulse" />
        <div className="absolute bottom-16 right-8 w-80 h-80 bg-cyan-600/20 rounded-full blur-3xl opacity-40 animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          <Link to="/login" className="inline-flex items-center gap-2 text-gray-400 hover:text-primary transition mb-6">
            <ArrowRight className="rotate-180" size={18} />
            <span>Voltar para login</span>
          </Link>

          <div className="bg-gradient-to-br from-slate-900/60 to-slate-800/60 backdrop-blur-xl rounded-2xl p-8 border border-slate-700/50 shadow-2xl">
            <h1 className="text-2xl font-bold text-primary">Redefinir senha</h1>
            <p className="text-gray-400 mt-2">
              Informe seu email ou usuario. Enviaremos um link para criar uma nova senha.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="identifier" className="block text-sm font-medium text-gray-300 mb-2">
                  Email ou usuario
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 text-gray-500" size={18} />
                  <input
                    id="identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:bg-slate-700/70 transition"
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? 'Enviando...' : <>Enviar link <Send size={17} /></>}
              </button>
            </form>

            {sent && (
              <div className="mt-5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                Solicitacao enviada. Verifique seu email e a caixa de spam.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
