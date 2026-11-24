import { createContext, useCallback, useContext, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
const ToastContext = createContext(null);
const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const notify = useCallback(
    (title, variant = "success", description) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, description, variant }]);
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss]
  );
  return <ToastContext.Provider value={{ notify }}>
      {children}
      <div
    aria-live="polite"
    className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
  >
        {toasts.map((t) => <div
    key={t.id}
    className="pointer-events-auto flex items-start gap-3 rounded-lg border border-[#E2DFD5] bg-white p-3.5 shadow-lg transition-all"
  >
            {t.variant === "success" && <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />}
            {t.variant === "error" && <AlertCircle className="w-4 h-4 text-[#B91C1C] shrink-0 mt-0.5" />}
            {t.variant === "info" && <Info className="w-4 h-4 text-[#183D2D] shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#1C2420]">{t.title}</p>
              {t.description && <p className="text-xs text-[#6E6C63] mt-0.5 break-words">{t.description}</p>}
            </div>
            <button
    type="button"
    onClick={() => dismiss(t.id)}
    className="text-[#6E6C63] hover:text-[#1C2420] p-0.5 rounded"
    aria-label="Dismiss notification"
  >
              <X className="w-4 h-4" />
            </button>
          </div>)}
      </div>
    </ToastContext.Provider>;
};
function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
export {
  ToastProvider,
  useToast
};
