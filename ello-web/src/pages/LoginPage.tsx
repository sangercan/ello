import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '@store/authStore'
import { toast } from 'react-hot-toast'
import { Mail, Lock, Users, Sparkles, Share2, ArrowRight } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({ email: '', password: '' })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.email || !formData.password) {
      toast.error('Preencha todos os campos')
      return
    }

    setLoading(true)
    try {
      console.log('🔐 Tentando fazer login com:', formData.email)
      await login(formData.email, formData.password)
      console.log('✅ Login bem-sucedido!')
      toast.success('Login realizado!')
      setTimeout(() => navigate('/dashboard'), 500)
    } catch (error: any) {
      console.error('❌ Erro de login:', error)
      let errorMessage = 'Erro ao fazer login'
      
      if (typeof error === 'string') {
        errorMessage = error
      } else if (error.response?.data?.detail) {
        errorMessage = String(error.response.data.detail)
      } else if (error.message) {
        errorMessage = String(error.message)
      }
      
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-600/20 rounded-full blur-3xl opacity-50 animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl opacity-50 animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-pink-600/20 rounded-full blur-3xl opacity-30 animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Back to Home */}
        <div className="fixed top-4 left-4 z-50">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-primary transition"
          >
            <ArrowRight className="rotate-180" size={20} />
            <span>Voltar</span>
          </Link>
        </div>

        {/* Main Container */}
        <div className="min-h-screen flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-7xl grid md:grid-cols-2 gap-12 items-center">
            {/* Left Side - Features */}
            <div className="hidden md:flex flex-col gap-8">
              <div>
                <h2 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
                  <span className="bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400 bg-clip-text text-transparent">
                    Connect
                  </span>
                </h2>
                <p className="text-gray-300 text-lg">
                  Conecte-se com pessoas que compartilham seus interesses. Construa comunidades, faça amizades e encontre sua tribe.
                </p>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-3 bg-purple-500/20 rounded-lg">
                  <Users className="text-purple-400" size={24} />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Comunidade Global</h3>
                  <p className="text-gray-400 text-sm">Milhões de usuários fazendo conexões reais</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-500/20 rounded-lg">
                  <Sparkles className="text-blue-400" size={24} />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Descoberta Inteligente</h3>
                  <p className="text-gray-400 text-sm">Encontre pessoas baseado em seus interesses</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-3 bg-pink-500/20 rounded-lg">
                  <Share2 className="text-pink-400" size={24} />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Compartilhe Livremente</h3>
                  <p className="text-gray-400 text-sm">Expresse-se sem limites, com segurança e privacidade</p>
                </div>
              </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="w-full">
              {/* Header */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-2 mb-6 backdrop-blur-sm">
                  <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                  <span className="text-sm text-gray-300">Bem-vindo de volta</span>
                </div>
                <h1 className="text-4xl font-bold text-primary mb-2">ELLO</h1>
                <p className="text-gray-400">Entre na sua conta para continuar</p>
              </div>

              {/* Form */}
              <form
                onSubmit={handleSubmit}
                className="bg-gradient-to-br from-slate-900/50 to-slate-800/50 backdrop-blur-xl rounded-2xl p-8 space-y-6 border border-slate-700/50 shadow-2xl"
              >
                {/* Email Input */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                    Email ou usuário
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3.5 text-gray-500" size={20} />
                    <input
                      id="email"
                      type="text"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="seu@email.com"
                      className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:bg-slate-700/70 transition"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                    Senha
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3.5 text-gray-500" size={20} />
                    <input
                      id="password"
                      type="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:bg-slate-700/70 transition"
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? 'Entrando...' : <>Entrar <ArrowRight size={18} /></>}
                </button>

                {/* Separator */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-600/50"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="px-2 bg-gradient-to-br from-slate-900/50 to-slate-800/50 text-gray-400">ou</span>
                  </div>
                </div>

                {/* Register Link */}
                <p className="text-center text-gray-400">
                  Não tem conta?{' '}
                  <Link to="/register" className="text-primary hover:text-primary/80 font-semibold transition">
                    Criar conta
                  </Link>
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
