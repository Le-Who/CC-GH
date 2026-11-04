import { useLayoutEffect, useRef, useState } from 'react';

type CompletionAttempt = {
  id: string;
  control: HTMLElement;
  dialog: HTMLElement | null;
  keyboard: boolean;
  settled: boolean;
  failed: boolean;
};

/** Announce confirmed menu actions whose controls disappear on completion. */
export function useMenuCompletion(resolveConfirmed: (id: string) => string | null, busy: boolean) {
  const pending = useRef<CompletionAttempt | null>(null);
  const [message, setMessage] = useState('');
  const [, refresh] = useState(0);

  useLayoutEffect(() => {
    const attempt = pending.current;
    if (!attempt?.settled || busy) return;
    pending.current = null;
    if (attempt.failed) return;
    const confirmed = resolveConfirmed(attempt.id);
    if (!confirmed) return;
    setMessage(confirmed);

    const { control, dialog } = attempt;
    const active = document.activeElement;
    if (!attempt.keyboard || control.isConnected || !dialog?.isConnected || dialog.closest('[inert]')) return;
    if (active !== document.body && active?.isConnected) return;
    const viewport = dialog.querySelector<HTMLElement>('.gs2-dialog-scroll')?.getBoundingClientRect();
    const next = Array.from(dialog.querySelectorAll<HTMLElement>('[data-menu-completion-action]:not(:disabled)')).find(node => {
      const rect = node.getBoundingClientRect();
      return viewport && rect.height > 0 && rect.top >= viewport.top && rect.bottom <= viewport.bottom;
    }) || dialog.querySelector<HTMLElement>('.gs2-close');
    next?.focus({ preventScroll: true });
  });

  const run = async (id: string, event: { currentTarget: HTMLElement; detail: number }, action: () => unknown) => {
    // Keep the first attempt's focus ownership during repeated submissions.
    if (pending.current) return false;
    const control = event.currentTarget;
    const attempt: CompletionAttempt = {
      id, control, dialog: control.closest<HTMLElement>('[role="dialog"]'),
      keyboard: event.detail === 0 && document.activeElement === control,
      settled: false, failed: false,
    };
    pending.current = attempt;
    setMessage('');
    try {
      const result = await action();
      if (result === false) attempt.failed = true;
      return result;
    } catch (error) {
      attempt.failed = true;
      throw error;
    } finally {
      attempt.settled = true;
      refresh(value => value + 1);
    }
  };

  return { message, run };
}
