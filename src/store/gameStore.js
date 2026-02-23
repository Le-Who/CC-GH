import { create } from "zustand";

export const useGameStore = create((set, get) => ({
  slices: {},
}));

export const GameStore = {
  getState: (sliceKey) => {
    const s = useGameStore.getState().slices;
    return sliceKey ? s[sliceKey] : s;
  },

  setState: (sliceKey, updater) => {
    useGameStore.setState((prev) => {
      const prevSlice = prev.slices[sliceKey];
      const nextSlice =
        typeof updater === "function"
          ? updater(prevSlice)
          : { ...prevSlice, ...updater };
      return { slices: { ...prev.slices, [sliceKey]: nextSlice } };
    });
  },

  subscribe: (sliceKey, fn) => {
    return useGameStore.subscribe((state, prevState) => {
      if (state.slices[sliceKey] !== prevState.slices[sliceKey]) {
        fn(state.slices[sliceKey], prevState.slices[sliceKey]);
      }
    });
  },

  registerSlice: (sliceKey, initialState) => {
    useGameStore.setState((prev) => ({
      slices: { ...prev.slices, [sliceKey]: initialState },
    }));
  },

  optimistic: async (
    sliceKey,
    optimisticUpdate,
    asyncAction,
    onSuccess,
    onError,
  ) => {
    const snapshot = { ...GameStore.getState(sliceKey) };
    GameStore.setState(sliceKey, optimisticUpdate);
    try {
      const result = await asyncAction();
      if (result && result.error) {
        GameStore.setState(sliceKey, () => snapshot);
        if (onError) onError(result.error, snapshot);
        return result;
      }
      if (onSuccess) {
        GameStore.setState(sliceKey, (current) => onSuccess(result, current));
      }
      return result;
    } catch (err) {
      GameStore.setState(sliceKey, () => snapshot);
      if (onError) onError(err, snapshot);
      throw err;
    }
  },
};
