import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export function Accordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Disclosure defaultOpen={defaultOpen}>
      {({ open }) => (
        <div className="rounded-md border border-gray-200 dark:border-gray-700">
          <DisclosureButton className="flex w-full items-center justify-between px-4 py-3 text-left">
            <span className="text-xl">{title}</span>
            <ChevronDown size={20} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </DisclosureButton>
          <DisclosurePanel className="border-t border-gray-200 p-4 dark:border-gray-700">
            {children}
          </DisclosurePanel>
        </div>
      )}
    </Disclosure>
  );
}
