/** Anúncios para leitor de tela: `aria-live="polite"`, sem roubar o foco. */
export function LiveRegion({ text }: { text: string }) {
  return (
    <div aria-live="polite" aria-atomic="true" role="status" className="sr-only">
      {text}
    </div>
  )
}
