import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle, Loader, Zap, Users, Sparkles, TrendingUp, ArrowRight, Github, Twitter, Linkedin } from 'lucide-react'
import { apiService, type HealthResponse, type AppInfoResponse } from '@services/api'

export default function LandingPage() {
  const [apiStatus, setApiStatus] = useState<HealthResponse | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfoResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchBackendData()
    const handleScroll = () => {
      // Smooth scroll effect for animations
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const fetchBackendData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [healthResult, infoResult] = await Promise.allSettled([
        apiService.getHealth(),
        apiService.getAppInfo(),
      ])

      if (healthResult.status === 'fulfilled') {
        setApiStatus(healthResult.value)
      } else {
        throw healthResult.reason
      }

      if (infoResult.status === 'fulfilled') {
        setAppInfo(infoResult.value)
      } else {
        setAppInfo({
          message: 'Ello Social Backend Running',
          version: '1.0.0',
          environment: 'production',
        })
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to connect to backend'
      setError(errorMsg)
      console.error('API Error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-600/20 rounded-full blur-3xl opacity-50 animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl opacity-50 animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-pink-600/20 rounded-full blur-3xl opacity-30 animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Navigation */}
        <nav className="fixed top-0 w-full bg-black/50 backdrop-blur-md border-b border-white/10 z-50">
          <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center font-bold">
                E
              </div>
              <span className="text-xl font-bold">ELLO</span>
            </div>
            <div className="hidden md:flex gap-8">
              <a href="#features" className="hover:text-purple-400 transition">Features</a>
              <a href="#stats" className="hover:text-purple-400 transition">Stats</a>
              <a href="#status" className="hover:text-purple-400 transition">Status</a>
            </div>
            <div className="flex gap-3">
              <Link
                to="/login"
                className="px-6 py-2 border border-purple-500/50 hover:border-purple-400 hover:bg-purple-500/10 rounded-lg transition"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg transition font-semibold"
              >
                Get Started
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="min-h-screen flex items-center justify-center px-6 pt-20">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-2 mb-8 backdrop-blur-sm">
              <Zap className="w-4 h-4 text-purple-400" />
              <span className="text-sm">Welcome to the future of social connection</span>
            </div>

            <h1 className="text-6xl md:text-7xl lg:text-8xl font-black mb-6 leading-tight">
              <span className="bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400 bg-clip-text text-transparent">
                Connect, Create, Share
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-gray-300 mb-12 max-w-2xl mx-auto leading-relaxed">
              The modern social platform where creativity meets community. Share your moments, vibe with others, and build meaningful connections.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link
                to="/register"
                className="group px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg font-bold text-lg transition transform hover:scale-105 inline-flex items-center justify-center gap-2"
              >
                Start Free <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition" />
              </Link>
              <Link
                to="/login"
                className="px-8 py-4 border-2 border-purple-500/50 hover:border-purple-400 hover:bg-purple-500/10 rounded-lg font-bold text-lg transition backdrop-blur-sm"
              >
                Sign In
              </Link>
            </div>

            {/* Status Badge */}
            <div id="status" className="inline-block bg-black/40 border border-white/10 rounded-2xl p-1 backdrop-blur-sm hover:border-white/20 transition">
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-6">
                <p className="text-sm text-gray-400 mb-3">Backend Status</p>
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader className="w-5 h-5 text-purple-400 animate-spin" />
                    <span>Connecting...</span>
                  </div>
                ) : error ? (
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                ) : apiStatus ? (
                  <div className="flex items-center gap-2 text-green-400 font-semibold">
                    <CheckCircle className="w-5 h-5 flex-shrink-0" />
                    <span>{apiStatus.service}{appInfo?.version ? ` • ${appInfo.version}` : ''}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 px-6 border-t border-white/5">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-5xl md:text-6xl font-black mb-4">Powerful Features</h2>
              <p className="text-xl text-gray-400">Everything you need to express yourself and connect with others</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: Sparkles,
                  title: 'Moments',
                  description: 'Share your daily moments with stunning visuals and real-time engagement',
                },
                {
                  icon: Users,
                  title: 'Community',
                  description: 'Connect with like-minded people and build meaningful communities',
                },
                {
                  icon: TrendingUp,
                  title: 'Vibes',
                  description: 'Discover trending content and what\'s resonating with your network',
                },
              ].map((feature, i) => (
                <div
                  key={i}
                  className="group relative bg-gradient-to-br from-slate-900/50 to-slate-800/30 border border-white/10 hover:border-purple-500/50 rounded-2xl p-8 transition transform hover:scale-105 backdrop-blur-sm overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 to-blue-600/10 opacity-0 group-hover:opacity-100 transition" />
                  <div className="relative">
                    <div className="mb-4 p-3 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-lg w-fit">
                      <feature.icon className="w-6 h-6 text-purple-400" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                    <p className="text-gray-400">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section id="stats" className="py-20 px-6 border-t border-white/5">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-4 gap-8">
              {[
                { label: 'Active Users', value: '100K+', icon: Users },
                { label: 'Moments Shared', value: '50M+', icon: Sparkles },
                { label: 'Countries', value: '180+', icon: TrendingUp },
                { label: 'Engagement', value: '99.9%', icon: Zap },
              ].map((stat, i) => (
                <div key={i} className="group">
                  <div className="bg-gradient-to-br from-slate-900/50 to-slate-800/30 border border-white/10 hover:border-purple-500/50 rounded-2xl p-8 text-center transition backdrop-blur-sm">
                    <div className="mb-4 flex justify-center">
                      <stat.icon className="w-8 h-8 text-purple-400 group-hover:scale-110 transition" />
                    </div>
                    <p className="text-4xl font-black mb-2 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                      {stat.value}
                    </p>
                    <p className="text-gray-400">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-6 border-t border-white/5">
          <div className="max-w-4xl mx-auto">
            <div className="relative bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-3xl p-12 md:p-16 backdrop-blur-sm overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 to-transparent opacity-50" />
              <div className="relative text-center">
                <h2 className="text-4xl md:text-5xl font-black mb-6">Ready to join the revolution?</h2>
                <p className="text-xl text-gray-300 mb-8">Start connecting, creating, and sharing today. It's free.</p>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 px-8 py-4 bg-white text-black font-bold rounded-lg hover:bg-gray-100 transition transform hover:scale-105"
                >
                  Get Started Now <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/5 py-12 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-4 gap-12 mb-12">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center font-bold">
                    E
                  </div>
                  <span className="text-lg font-bold">ELLO</span>
                </div>
                <p className="text-gray-400">The modern social platform for everyone.</p>
              </div>
              <div>
                <h4 className="font-bold mb-4">Product</h4>
                <ul className="space-y-2 text-gray-400">
                  <li><a href="#features" className="hover:text-purple-400 transition">Features</a></li>
                  <li><a href="#stats" className="hover:text-purple-400 transition">Pricing</a></li>
                  <li><a href="#status" className="hover:text-purple-400 transition">Status</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold mb-4">Company</h4>
                <ul className="space-y-2 text-gray-400">
                  <li><a href="#" className="hover:text-purple-400 transition">About</a></li>
                  <li><a href="#" className="hover:text-purple-400 transition">Blog</a></li>
                  <li><a href="#" className="hover:text-purple-400 transition">Contact</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold mb-4">Follow</h4>
                <div className="flex gap-4">
                  <a href="#" className="text-gray-400 hover:text-purple-400 transition">
                    <Github className="w-5 h-5" />
                  </a>
                  <a href="#" className="text-gray-400 hover:text-purple-400 transition">
                    <Twitter className="w-5 h-5" />
                  </a>
                  <a href="#" className="text-gray-400 hover:text-purple-400 transition">
                    <Linkedin className="w-5 h-5" />
                  </a>
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center text-gray-400">
              <p>&copy; 2026 ELLO. All rights reserved.</p>
              <div className="flex gap-6 mt-4 md:mt-0">
                <a href="#" className="hover:text-purple-400 transition">Privacy</a>
                <a href="#" className="hover:text-purple-400 transition">Terms</a>
                <a href="#" className="hover:text-purple-400 transition">Cookies</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
