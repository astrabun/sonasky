interface NsfwToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export function NsfwToggle({ enabled, onToggle }: NsfwToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`text-sm px-3 py-1.5 rounded-full font-medium transition-colors ${
        enabled
          ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
          : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600"
      }`}
    >
      {enabled ? "NSFW: shown" : "NSFW: hidden"}
    </button>
  );
}
