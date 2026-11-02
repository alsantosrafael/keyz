import type { MicStatus } from '../../application'

export type Plataforma = 'ios' | 'android' | 'outra'

/** Reconhece o aparelho pelo user agent (iPadOS se apresenta como Mac com toque). */
export function detectarPlataforma(ua: string, pontosDeToque = 0): Plataforma {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && pontosDeToque > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'outra'
}

export const COMO_LIBERAR: Record<Plataforma, string> = {
  ios: 'No iPhone: toque em "aA" na barra do Safari › Ajustes do site › Microfone › Permitir. Se não aparecer o pedido, veja Ajustes › Apps › Safari › Microfone.',
  android: 'No Android: toque no ícone ao lado do endereço › Permissões › Microfone › Permitir. Se não resolver, veja Configurações › Apps › navegador › Permissões.',
  outra: 'Libere o microfone nas configurações do site (ícone ao lado do endereço).',
}

/** Explicação na tela de Entrada quando o microfone não está funcionando. `null` quando não há problema a explicar. */
export function problemaDoMicrofone(status: MicStatus, plataforma: Plataforma = 'outra'): string | null {
  switch (status.kind) {
    case 'denied': return `Permissão negada. ${COMO_LIBERAR[plataforma]} Depois toque em Ativar microfone. O teclado na tela continua funcionando.`
    case 'unsupported': return 'Este navegador não permite usar o microfone aqui. O teclado na tela continua funcionando.'
    case 'no-device': return 'Nenhum microfone encontrado. O teclado na tela continua funcionando.'
    case 'interrupted': return 'O microfone parou (troca de aba, ligação ou bloqueio tirou o áudio). Toque em Ativar microfone para continuar.'
    case 'failed': return `Não foi possível iniciar o áudio: ${status.message}`
    case 'blocked': return `O sistema está bloqueando o áudio do microfone (nível zero). ${COMO_LIBERAR[plataforma]}`
    case 'no-audio': return 'Nenhum áudio chegando do microfone.'
    default: return null
  }
}
