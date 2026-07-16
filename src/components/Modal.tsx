import { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string; // vd "max-w-md" (mặc định), "max-w-6xl" cho bảng rộng
}

export default function Modal({ open, title, onClose, children, maxWidth = "max-w-md" }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className={`flex max-h-[88vh] w-full ${maxWidth} flex-col rounded-xl border border-base-800 bg-base-900 p-6 shadow-2xl`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-medium text-base-100">{title}</h2>
          <button onClick={onClose} className="text-base-400 hover:text-base-100">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
