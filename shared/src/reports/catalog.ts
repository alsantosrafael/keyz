/** Tipos de relatório que o app e o endpoint aceitam. Uma fonte só: o formulário, a validação e a issue saem daqui. */
export interface ReportField {
  id: string
  label: string
  hint?: string
  required: boolean
  /** Texto de várias linhas. */
  multiline: boolean
}

export interface ReportType {
  id: string
  title: string
  description: string
  /** Rótulos do GitHub aplicados à issue (já existem no repositório). */
  labels: string[]
  /** Prefixo do título da issue. */
  prefix: string
  fields: ReportField[]
}

const happened = (hint: string): ReportField => ({ id: 'o-que', label: 'O que aconteceu', hint, required: true, multiline: true })
const steps: ReportField = { id: 'passos', label: 'Como reproduzir', hint: 'Passo a passo, do começo', required: false, multiline: true }

export const REPORT_TYPES = [
  {
    id: 'bug',
    title: 'Algo não funciona',
    description: 'Um erro, travamento ou comportamento inesperado.',
    labels: ['bug'],
    prefix: 'Bug',
    fields: [happened('E o que você esperava que acontecesse'), steps],
  },
  {
    id: 'audio',
    title: 'Problema com o microfone',
    description: 'Notas erradas, não reconhece, muito ruído.',
    labels: ['bug'],
    prefix: 'Microfone',
    fields: [
      happened('Ex.: toquei Dó e apareceu Ré'),
      { id: 'instrumento', label: 'Instrumento e ambiente', hint: 'Ex.: piano acústico, sala com ventilador', required: false, multiline: false },
      steps,
    ],
  },
  {
    id: 'midi',
    title: 'Problema com teclado MIDI',
    description: 'O teclado não é detectado ou as notas falham.',
    labels: ['bug'],
    prefix: 'MIDI',
    fields: [
      happened('Ex.: o teclado não aparece na lista'),
      { id: 'aparelho', label: 'Modelo do teclado e conexão', hint: 'Ex.: Yamaha P-45 por USB', required: false, multiline: false },
      steps,
    ],
  },
  {
    id: 'acessibilidade',
    title: 'Dificuldade de acessibilidade',
    description: 'Leitor de tela, contraste, tamanho, movimento.',
    labels: ['accessibility'],
    prefix: 'Acessibilidade',
    fields: [
      happened('Onde você encontrou a dificuldade'),
      { id: 'recurso', label: 'Recurso de apoio usado', hint: 'Ex.: VoiceOver, zoom 200%, menos movimento', required: false, multiline: false },
    ],
  },
  {
    id: 'melhoria',
    title: 'Ideia ou melhoria',
    description: 'Algo que tornaria o Keyz melhor.',
    labels: ['enhancement'],
    prefix: 'Ideia',
    fields: [
      { id: 'problema', label: 'Qual problema isso resolve', required: true, multiline: true },
      { id: 'proposta', label: 'Como você imagina', required: false, multiline: true },
    ],
  },
  {
    id: 'duvida',
    title: 'Dúvida',
    description: 'Não entendi como algo funciona.',
    labels: ['question'],
    prefix: 'Dúvida',
    fields: [{ id: 'pergunta', label: 'Sua dúvida', required: true, multiline: true }],
  },
] as const satisfies readonly ReportType[]

export type ReportTypeId = (typeof REPORT_TYPES)[number]['id']
export const REPORT_TYPE_IDS = REPORT_TYPES.map((t) => t.id) as [ReportTypeId, ...ReportTypeId[]]

export const reportType = (id: string): ReportType | undefined => REPORT_TYPES.find((t) => t.id === id)
