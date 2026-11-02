import type { MicStatus } from '../../application'

/** Explicação na tela de Entrada quando o microfone não está funcionando. `null` quando não há problema a explicar. */
export function problemaDoMicrofone(status: MicStatus): string | null {
  switch (status.kind) {
    case 'denied': return 'Permissão negada. Libere o microfone nas configurações do site (ícone ao lado do endereço) e tente de novo. O teclado na tela continua funcionando.'
    case 'unsupported': return 'Este navegador não permite usar o microfone aqui. O teclado na tela continua funcionando.'
    case 'no-device': return 'Nenhum microfone encontrado. O teclado na tela continua funcionando.'
    case 'interrupted': return 'O microfone parou (troca de aba, ligação ou bloqueio tirou o áudio). Toque em Ativar microfone para continuar.'
    case 'failed': return `Não foi possível iniciar o áudio: ${status.message}`
    case 'blocked': return 'O sistema está bloqueando o áudio do microfone (nível zero). Verifique a permissão do navegador.'
    case 'no-audio': return 'Nenhum áudio chegando do microfone.'
    default: return null
  }
}
