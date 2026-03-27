/**
 * ═══════════════════════════════════════════════════════
 *  useModal — React/Zustand hook for centralized modal state
 *
 *  Replaces shared.js's imperative safeShowModal() with
 *  a reactive store for tracking open modals.
 *
 *  Usage in React:
 *    const { activeModal, openModal, closeModal } = useModal();
 *    if (activeModal === 'energy') return <EnergyModal />;
 *
 *  Usage in Vanilla JS (via bridge):
 *    import { modalStore } from '@/hooks/useModal';
 *    modalStore.getState().openModal('energy', { requiredEnergy: 5 });
 * ═══════════════════════════════════════════════════════
 */
import { create } from "zustand";

export const modalStore = create((set, get) => ({
  /** Currently active modal ID, or null */
  activeModal: null,

  /** Arbitrary props/data passed to the active modal */
  modalProps: {},

  /** History stack for nested modal support */
  _stack: [],

  openModal: (modalId, props = {}) => {
    const current = get().activeModal;
    const stack = [...get()._stack];

    // Push current modal to stack if one is already open
    if (current) {
      stack.push({ id: current, props: get().modalProps });
    }

    set({
      activeModal: modalId,
      modalProps: props,
      _stack: stack,
    });
  },

  closeModal: () => {
    const stack = [...get()._stack];
    if (stack.length > 0) {
      // Pop previous modal from stack
      const prev = stack.pop();
      set({
        activeModal: prev.id,
        modalProps: prev.props,
        _stack: stack,
      });
    } else {
      set({
        activeModal: null,
        modalProps: {},
        _stack: [],
      });
    }
  },

  /** Close all modals and clear stack */
  closeAll: () =>
    set({
      activeModal: null,
      modalProps: {},
      _stack: [],
    }),

  /** Check if a specific modal is active */
  isOpen: (modalId) => get().activeModal === modalId,
}));

export function useModal() {
  return modalStore();
}

export const useActiveModal = () => modalStore((s) => s.activeModal);
export const useModalProps = () => modalStore((s) => s.modalProps);
