import { useState, useCallback } from "react";

export interface DialogState<T = any> {
  isOpen: boolean;
  data: T | null;
  open: (payload?: T | null) => void;
  close: () => void;
  toggle: () => void;
  setData: (data: T | null) => void;
  setIsOpen: (isOpen: boolean) => void;
}

export function useDialogState<T = any>(initialOpen = false, initialData: T | null = null): DialogState<T> {
  const [isOpen, setIsOpen] = useState<boolean>(initialOpen);
  const [data, setData] = useState<T | null>(initialData);

  const open = useCallback((payload: T | null = null) => {
    setData(payload);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setData(null);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return { isOpen, data, open, close, toggle, setData, setIsOpen };
}
