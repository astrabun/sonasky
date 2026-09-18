interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  name?: string;
}

export function Switch({ checked, onChange, name }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      name={name}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
