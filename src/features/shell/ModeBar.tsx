import { NavLink } from 'react-router-dom'
import { cn } from '../../ui/cn'
import { MODES } from './modes'

/**
 * Navegação entre os quatro modos. No celular: barra inferior com ícone e rótulo (acima do
 * teclado não: abaixo dele). Em telas largas: abas no topo. A aba ativa mostra a cor da faixa,
 * ícone preenchido e sublinhado: nunca só cor.
 */
export function ModeBar({ variant }: { variant: 'bottom' | 'top' }) {
  return (
    <nav aria-label="Modos" className={cn(variant === 'bottom' ? 'grid grid-cols-4 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] md:hidden' : 'hidden gap-1 md:flex')}>
      {MODES.map(({ id, path, label, Icon, text }) => (
        <NavLink
          key={id}
          to={path}
          className={({ isActive }) =>
            cn(
              't-label relative flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-control no-underline transition-colors duration-[120ms]',
              variant === 'bottom' ? 'flex-col py-1.5 text-[12px]' : 'px-4',
              isActive ? cn(text, 'font-semibold') : 'text-muted hover:text-ink',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={variant === 'bottom' ? 24 : 20} strokeWidth={1.75} fill={isActive ? 'currentColor' : 'none'} fillOpacity={0.22} aria-hidden />
              <span>{label}</span>
              {isActive && <span aria-hidden className={cn('absolute rounded-full bg-current', variant === 'bottom' ? 'inset-x-6 top-0 h-0.5' : 'inset-x-3 -bottom-0.5 h-0.5')} />}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
