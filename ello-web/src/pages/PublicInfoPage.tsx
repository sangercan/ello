import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'

type PageKey =
  | 'legal'
  | 'privacy'
  | 'terms'
  | 'community-guidelines'
  | 'report'
  | 'delete-account'

type PageSection = {
  title: string
  paragraphs?: string[]
  bullets?: string[]
}

type PageContent = {
  title: string
  subtitle: string
  updatedAt: string
  sections: PageSection[]
}

type PublicInfoPageProps = {
  pageKey: PageKey
}

const contentByPage: Record<PageKey, PageContent> = {
  legal: {
    title: 'Informacoes Legais',
    subtitle: 'Transparencia sobre a operacao do Ello Social e canais oficiais de contato.',
    updatedAt: '12 de marco de 2026',
    sections: [
      {
        title: 'Titularidade da plataforma',
        paragraphs: [
          'Ello Social e uma plataforma digital de rede social para conexoes entre pessoas, criacao de conteudo e interacoes em comunidade.',
          'Todo uso da plataforma deve seguir os Termos de Uso, a Politica de Privacidade e as Diretrizes da Comunidade.',
        ],
      },
      {
        title: 'Contato oficial',
        bullets: [
          'Assuntos juridicos: legal@ellosocial.com',
          'Privacidade e dados: privacy@ellosocial.com',
          'Suporte geral: suporte@ellosocial.com',
        ],
      },
      {
        title: 'Base legal e conformidade',
        paragraphs: [
          'A plataforma observa as leis aplicaveis ao tratamento de dados pessoais e a publicacao de conteudo em ambiente digital.',
          'Quando necessario, podemos atualizar documentos legais para refletir mudancas regulatorias, operacionais ou de seguranca.',
        ],
      },
      {
        title: 'Atualizacoes',
        paragraphs: [
          'Sempre que houver mudancas relevantes nos documentos legais, a data de atualizacao sera revisada nesta pagina e nos documentos relacionados.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Politica de Privacidade',
    subtitle: 'Como coletamos, usamos, protegemos e armazenamos suas informacoes.',
    updatedAt: '12 de marco de 2026',
    sections: [
      {
        title: 'Dados que coletamos',
        bullets: [
          'Dados de cadastro: nome, email, username e credenciais de acesso.',
          'Dados de uso: interacoes, curtidas, comentarios, preferencias e historico de atividade.',
          'Dados tecnicos: dispositivo, endereco IP, logs de acesso e informacoes de performance.',
          'Dados opcionais: foto de perfil, biografia, localizacao e conteudos enviados por voce.',
        ],
      },
      {
        title: 'Como usamos seus dados',
        bullets: [
          'Disponibilizar recursos da plataforma e autenticar sua conta.',
          'Personalizar experiencia, feed e recomendacoes.',
          'Prevenir fraude, abuso e comportamentos que violem as regras.',
          'Cumprir obrigacoes legais e regulatorias quando aplicavel.',
        ],
      },
      {
        title: 'Compartilhamento de informacoes',
        paragraphs: [
          'Nao vendemos dados pessoais. O compartilhamento ocorre apenas quando necessario para operacao do servico, com parceiros tecnicos, ou por determinacao legal.',
        ],
      },
      {
        title: 'Retencao e seguranca',
        paragraphs: [
          'Mantemos os dados pelo periodo necessario para finalidades legitimas da plataforma e cumprimento de obrigacoes legais.',
          'Aplicamos medidas tecnicas e organizacionais para reduzir riscos de acesso nao autorizado, alteracao indevida e vazamento.',
        ],
      },
      {
        title: 'Seus direitos',
        bullets: [
          'Solicitar acesso, correcao ou atualizacao de dados.',
          'Solicitar exclusao da conta e, quando aplicavel, de dados pessoais.',
          'Solicitar informacoes sobre tratamento e compartilhamento.',
          'Revogar consentimentos quando o tratamento depender dessa base legal.',
        ],
      },
    ],
  },
  terms: {
    title: 'Termos de Uso',
    subtitle: 'Regras para uso da plataforma, responsabilidades e condicoes de acesso.',
    updatedAt: '12 de marco de 2026',
    sections: [
      {
        title: 'Aceite dos termos',
        paragraphs: [
          'Ao criar conta ou utilizar o Ello Social, voce concorda com estes Termos de Uso e com as politicas relacionadas.',
        ],
      },
      {
        title: 'Conduta do usuario',
        bullets: [
          'Respeitar outros usuarios e nao publicar conteudo ilegal ou abusivo.',
          'Nao tentar invadir contas, sistemas ou explorar vulnerabilidades.',
          'Nao usar a plataforma para spam, fraude, assedio ou desinformacao maliciosa.',
          'Nao publicar conteudo que viole direitos de terceiros.',
        ],
      },
      {
        title: 'Conta e seguranca',
        paragraphs: [
          'Voce e responsavel por manter a confidencialidade das credenciais de acesso e por atividades realizadas na sua conta.',
          'Em caso de suspeita de acesso indevido, altere sua senha e contate o suporte imediatamente.',
        ],
      },
      {
        title: 'Conteudo publicado',
        paragraphs: [
          'O usuario permanece titular do conteudo que publica, mas concede licenca necessaria para exibicao e operacao dentro da plataforma.',
          'Podemos remover conteudos que violem estes termos, as diretrizes da comunidade ou exigencias legais.',
        ],
      },
      {
        title: 'Suspensao e encerramento',
        paragraphs: [
          'Contas podem ser suspensas ou encerradas em caso de violacoes graves ou reincidentes.',
          'Tambem podemos limitar funcionalidades para preservar seguranca e integridade da comunidade.',
        ],
      },
    ],
  },
  'community-guidelines': {
    title: 'Diretrizes da Comunidade',
    subtitle: 'Padroes de convivio para uma comunidade segura, diversa e respeitosa.',
    updatedAt: '12 de marco de 2026',
    sections: [
      {
        title: 'O que incentivamos',
        bullets: [
          'Interacoes respeitosas e construtivas.',
          'Conteudos autenticos e relevantes para a comunidade.',
          'Debates sem discurso de odio e sem ataques pessoais.',
          'Colaboracao e empatia com pessoas de diferentes contextos.',
        ],
      },
      {
        title: 'O que nao permitimos',
        bullets: [
          'Discurso de odio, violencia, ameacas ou assedio.',
          'Exploracao sexual, especialmente envolvendo menores.',
          'Golpes, phishing, spam e atividades enganosas.',
          'Divulgacao de informacoes pessoais sem autorizacao.',
          'Incentivo a autolesao ou atividades perigosas.',
        ],
      },
      {
        title: 'Aplicacao das regras',
        paragraphs: [
          'A moderacao pode agir com base em denuncias e analise interna, aplicando medidas como alerta, remocao de conteudo, limitacao de recursos e suspensao de conta.',
          'A gravidade, recorrencia e impacto da conduta sao considerados na decisao.',
        ],
      },
    ],
  },
  report: {
    title: 'Canal de Denuncia',
    subtitle: 'Como denunciar conteudo, contas ou comportamentos que violam nossas politicas.',
    updatedAt: '12 de marco de 2026',
    sections: [
      {
        title: 'Quando denunciar',
        bullets: [
          'Assedio, ameacas, discurso de odio ou violencia.',
          'Spam, fraude, golpes ou tentativa de phishing.',
          'Conteudo improprio, ilegal ou que viole direitos de terceiros.',
          'Perfis falsos, impersonacao e comportamento malicioso recorrente.',
        ],
      },
      {
        title: 'Como denunciar',
        bullets: [
          'Use os controles de denuncia no proprio conteudo ou perfil dentro do app.',
          'Se nao conseguir acessar o app, envie detalhes para report@ellosocial.com.',
          'Inclua links, username, horario aproximado e, se possivel, evidencias.',
        ],
      },
      {
        title: 'Analise e retorno',
        paragraphs: [
          'Nossa equipe avalia cada caso de acordo com os Termos de Uso e Diretrizes da Comunidade.',
          'Nem sempre podemos compartilhar detalhes da acao tomada por motivos de privacidade e seguranca.',
        ],
      },
      {
        title: 'Emergencias',
        paragraphs: [
          'Se houver risco imediato a vida ou integridade fisica, contate as autoridades locais antes de qualquer outro canal.',
        ],
      },
    ],
  },
  'delete-account': {
    title: 'Exclusao de Conta',
    subtitle: 'Como solicitar a exclusao da conta e o que acontece com seus dados.',
    updatedAt: '12 de marco de 2026',
    sections: [
      {
        title: 'Solicitar exclusao',
        bullets: [
          'No app: acesse Configuracoes e selecione a opcao de exclusao de conta (quando disponivel).',
          'Por suporte: envie solicitacao para delete-account@ellosocial.com usando o email vinculado a conta.',
        ],
      },
      {
        title: 'Efeitos da exclusao',
        bullets: [
          'Sua conta deixa de estar acessivel para login.',
          'Seu perfil deixa de aparecer para outros usuarios.',
          'Conteudos associados podem ser removidos ou anonimizados conforme politica interna e obrigacoes legais.',
        ],
      },
      {
        title: 'Retencao minima obrigatoria',
        paragraphs: [
          'Alguns registros podem ser mantidos por periodo limitado para prevencao a fraude, seguranca, auditoria e cumprimento de obrigacoes legais.',
        ],
      },
      {
        title: 'Prazo de processamento',
        paragraphs: [
          'Solicitacoes de exclusao sao processadas em prazo razoavel apos validacao de titularidade da conta.',
        ],
      },
    ],
  },
}

export default function PublicInfoPage({ pageKey }: PublicInfoPageProps) {
  const content = useMemo(() => contentByPage[pageKey], [pageKey])

  useEffect(() => {
    document.title = `${content.title} | Ello Social`
    return () => {
      document.title = 'Ello Social'
    }
  }, [content.title])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-900/70">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <Link to="/" className="text-sm text-primary hover:text-primary/80 transition">
            Ello Social
          </Link>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <Link to="/privacy" className="hover:text-slate-200 transition">Privacidade</Link>
            <Link to="/terms" className="hover:text-slate-200 transition">Termos</Link>
            <Link to="/community-guidelines" className="hover:text-slate-200 transition">Comunidade</Link>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-8 sm:py-10">
        <header className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white">{content.title}</h1>
          <p className="mt-3 text-sm sm:text-base text-slate-300 max-w-2xl">{content.subtitle}</p>
          <p className="mt-3 text-xs text-slate-500">Atualizado em {content.updatedAt}</p>
        </header>

        <div className="space-y-5">
          {content.sections.map((section) => (
            <section key={section.title} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
              <h2 className="text-lg font-semibold text-white">{section.title}</h2>

              {section.paragraphs && (
                <div className="mt-2 space-y-2">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="text-sm text-slate-300 leading-relaxed">
                      {paragraph}
                    </p>
                  ))}
                </div>
              )}

              {section.bullets && (
                <ul className="mt-3 space-y-2">
                  {section.bullets.map((bullet) => (
                    <li key={bullet} className="text-sm text-slate-300 leading-relaxed flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
