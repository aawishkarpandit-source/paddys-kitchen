import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Bottom-sheet on phones (menu flows), centered dialog on larger screens. */
  size?: 'md' | 'lg';
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Dialog'}
    >
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-stone-950/50 backdrop-blur-sm"
      />
      <div
        className={cn(
          'relative z-10 flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl',
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md',
          'max-sm:animate-[sheet-up_.18s_ease-out]',
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
            <h2 className="text-base font-bold text-stone-900">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-stone-100 bg-stone-50 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export default Modal;
