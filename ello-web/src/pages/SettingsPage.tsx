import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@store/authStore'
import apiClient from '@services/api'
import { toast } from 'react-hot-toast'
import { Save, Trash2 } from 'lucide-react'

const DELETE_CONFIRMATION_TEXT = 'EXCLUIR'

export default function SettingsPage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const updateUser = useAuthStore((state) => state.updateUser)
  const logout = useAuthStore((state) => state.logout)

  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState('')

  const [formData, setFormData] = useState({
    full_name: user?.full_name || '',
    bio: user?.bio || '',
    link: user?.link || '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await apiClient.updateProfile(formData)
      updateUser(response.data)
      toast.success('Perfil atualizado com sucesso!')
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Erro ao atualizar perfil')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!deletePassword.trim()) {
      toast.error('Informe sua senha para excluir a conta')
      return
    }

    if (deleteConfirmation.trim().toUpperCase() !== DELETE_CONFIRMATION_TEXT) {
      toast.error(`Digite ${DELETE_CONFIRMATION_TEXT} para confirmar`)
      return
    }

    const confirmed = window.confirm(
      'Essa acao e irreversivel. Sua conta sera excluida agora. Deseja continuar?'
    )
    if (!confirmed) return

    setDeleting(true)
    try {
      await apiClient.deleteAccount({
        password: deletePassword,
        confirmation_text: deleteConfirmation,
      })
      toast.success('Conta excluida com sucesso')
      logout()
      navigate('/login')
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Erro ao excluir conta')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="bg-gradient-to-r from-primary/10 to-transparent border-b border-slate-800 py-12">
        <div className="max-w-2xl mx-auto px-4">
          <h1 className="text-4xl font-bold mb-2">Configuracoes</h1>
          <p className="text-gray-400">Gerencie seus dados pessoais e preferencias</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="bg-slate-800 rounded-lg p-8 border border-slate-700">
          <div className="mb-6">
            <label htmlFor="full_name" className="block text-sm font-medium text-gray-300 mb-2">
              Nome completo
            </label>
            <input
              id="full_name"
              type="text"
              name="full_name"
              value={formData.full_name}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary"
            />
          </div>

          <div className="mb-6">
            <label htmlFor="bio" className="block text-sm font-medium text-gray-300 mb-2">
              Biografia
            </label>
            <textarea
              id="bio"
              name="bio"
              value={formData.bio}
              onChange={handleChange}
              rows={4}
              placeholder="Conte algo sobre voce..."
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary resize-none"
            />
          </div>

          <div className="mb-6">
            <label htmlFor="link" className="block text-sm font-medium text-gray-300 mb-2">
              Link pessoal
            </label>
            <input
              id="link"
              type="url"
              name="link"
              value={formData.link}
              onChange={handleChange}
              placeholder="https://seu-site.com"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 bg-primary hover:bg-primary/80 text-white font-semibold px-6 py-2 rounded-lg transition disabled:opacity-50"
            >
              <Save size={20} />
              {loading ? 'Salvando...' : 'Salvar mudancas'}
            </button>
          </div>
        </form>

        <div className="mt-8 bg-slate-800 rounded-lg p-8 border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-6">Informacoes da conta</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-400">Email</p>
              <p className="text-white font-semibold">{user?.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Usuario</p>
              <p className="text-white font-semibold">@{user?.username}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">ID</p>
              <p className="text-white font-semibold">{user?.id}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Membro desde</p>
              <p className="text-white font-semibold">
                {user?.created_at && new Date(user.created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-red-900/10 rounded-lg p-8 border border-red-900/20">
          <h2 className="text-xl font-bold text-red-500 mb-4">Zona de perigo</h2>
          <p className="text-gray-300 mb-5">
            Excluir conta e irreversivel. Para confirmar, informe sua senha e digite
            {' '}
            <span className="font-semibold text-red-300">{DELETE_CONFIRMATION_TEXT}</span>.
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="delete_password" className="block text-sm font-medium text-gray-300 mb-2">
                Senha atual
              </label>
              <input
                id="delete_password"
                type="password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                placeholder="Digite sua senha"
                className="w-full px-4 py-2 bg-slate-800 border border-red-900/40 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label htmlFor="delete_confirmation" className="block text-sm font-medium text-gray-300 mb-2">
                Confirmacao
              </label>
              <input
                id="delete_confirmation"
                type="text"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                placeholder={`Digite ${DELETE_CONFIRMATION_TEXT}`}
                className="w-full px-4 py-2 bg-slate-800 border border-red-900/40 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="inline-flex items-center gap-2 px-6 py-2 bg-red-900 hover:bg-red-800 text-white rounded-lg transition disabled:opacity-50"
            >
              <Trash2 size={18} />
              {deleting ? 'Excluindo conta...' : 'Excluir conta agora'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
