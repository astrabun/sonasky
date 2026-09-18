import {
  Menu as HeadlessMenu,
  MenuButton,
  MenuItem as HeadlessMenuItem,
  MenuItems,
} from "@headlessui/react";
import { Fragment, type ReactElement, type ReactNode } from "react";

export function Menu({ trigger, children }: { trigger: ReactElement; children: ReactNode }) {
  return (
    <HeadlessMenu as="div" className="relative inline-block">
      <MenuButton as={Fragment}>{trigger}</MenuButton>
      <MenuItems className="absolute right-0 z-20 mt-1 min-w-[220px] rounded-md border border-gray-200 bg-white py-1 shadow-lg focus:outline-none dark:border-gray-700 dark:bg-gray-900">
        {children}
      </MenuItems>
    </HeadlessMenu>
  );
}

export function MenuItem({ onClick, children }: { onClick?: () => void; children: ReactNode }) {
  return (
    <HeadlessMenuItem>
      <button
        type="button"
        onClick={onClick}
        className="block w-full px-4 py-2 text-left text-sm data-focus:bg-gray-100 dark:data-focus:bg-gray-800"
      >
        {children}
      </button>
    </HeadlessMenuItem>
  );
}
