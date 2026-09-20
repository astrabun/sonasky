import {
  Dialog as HeadlessDialog,
  DialogPanel,
  DialogTitle as HeadlessDialogTitle,
} from "@headlessui/react";
import type { ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  maxWidth?: "sm" | "md" | "lg";
  children?: ReactNode;
}

const maxWidthClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

export function Dialog({ open, onClose, maxWidth = "sm", children }: DialogProps) {
  return (
    <HeadlessDialog open={open} onClose={onClose} className="relative z-[10000]">
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel
          className={`w-full ${maxWidthClasses[maxWidth]} rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900`}
        >
          {children}
        </DialogPanel>
      </div>
    </HeadlessDialog>
  );
}

export function DialogTitle({ children }: { children?: ReactNode }) {
  return (
    <HeadlessDialogTitle className="mb-2 text-lg font-semibold">{children}</HeadlessDialogTitle>
  );
}

export function DialogContent({ children }: { children?: ReactNode }) {
  return <div className="mb-4">{children}</div>;
}

export function DialogContentText({ children }: { children?: ReactNode }) {
  return <p className="text-sm text-gray-600 dark:text-gray-300">{children}</p>;
}

export function DialogActions({ children }: { children?: ReactNode }) {
  return <div className="flex justify-end gap-2">{children}</div>;
}
