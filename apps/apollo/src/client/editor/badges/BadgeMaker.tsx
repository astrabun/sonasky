/**
 * The 88x31 badge maker. "Design" composes a badge from a background,
 * border, picture and text; "Pixels" touches it up pixel by pixel. Saving
 * uploads a PNG to the user's PDS (a media record) and writes the badge
 * record pointing at it, with the design kept so it can be edited again.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  BADGE_HEIGHT,
  BADGE_MAX_TEXTS,
  BADGE_WIDTH,
  defaultBadgeSource,
  type BadgeBorder,
  type BadgeFit,
  type BadgeFont,
  type BadgeSource,
  type BadgeText,
} from "../../../shared/badges.ts";
import type { BadgeEntry, MediaEntry } from "../../../shared/dto.ts";
import { api, ApiFailure, type BadgeInput } from "../../api.ts";
import { Button, Notice, Select, TextInput } from "../../components/ui.tsx";
import { useEditorState } from "../context.tsx";
import { MediaField } from "../MediaLibrary.tsx";
import { BadgeDetailsFields, badgeDetailsError, type BadgeDetails } from "./BadgeDetails.tsx";
import {
  canvasToPng,
  fitRect,
  drawBadge,
  loadImage,
  newCanvas,
  textHeight,
  type LoadedPictures,
} from "./compose.ts";
import { measureBitmapText } from "./pixelFont.ts";
import { PixelPainter } from "./PixelPainter.tsx";
import type { Pixels } from "./pixels.ts";

type Mode = "design" | "pixels";

const FONT_OPTIONS: { value: BadgeFont; label: string }[] = [
  { value: "pixel", label: "Pixel (5x7)" },
  { value: "tiny", label: "Tiny pixel (3x5)" },
  { value: "sans", label: "Sans-serif (smooth)" },
  { value: "serif", label: "Serif (smooth)" },
  { value: "mono", label: "Monospace (smooth)" },
];

/** What the maker opens with. */
export type MakerStart =
  | { kind: "new" }
  | { kind: "edit"; badge: BadgeEntry }
  /** A picture that isn't 88x31, to fit into a new design. */
  | { kind: "fromMedia"; media: MediaEntry; details: BadgeDetails };

function pixelsFrom(canvas: HTMLCanvasElement): Pixels {
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const img = ctx.getImageData(0, 0, BADGE_WIDTH, BADGE_HEIGHT);
  return { width: img.width, height: img.height, data: img.data };
}

/** Pixels of an existing image, scaled to 88x31 if it isn't already. */
async function pixelsOfUrl(url: string): Promise<Pixels> {
  const img = await loadImage(url);
  const canvas = newCanvas();
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, BADGE_WIDTH, BADGE_HEIGHT);
  return pixelsFrom(canvas);
}

function initialSource(start: MakerStart): BadgeSource {
  if (start.kind === "edit" && start.badge.value.source) return start.badge.value.source;
  const source = defaultBadgeSource();
  if (start.kind === "fromMedia") {
    source.image = {
      media: start.media.rkey,
      fit: "cover",
      x: 0,
      y: 0,
      w: BADGE_WIDTH,
      h: BADGE_HEIGHT,
    };
    source.texts = [];
    source.border = "line";
  }
  return source;
}

function initialDetails(start: MakerStart): BadgeDetails {
  if (start.kind === "fromMedia") return start.details;
  if (start.kind !== "edit") return { alt: "", noAlt: false, href: "" };
  const v = start.badge.value;
  return { alt: v.alt, noAlt: Boolean(v.noAlt), href: v.href ?? "" };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 flex-none cursor-pointer rounded border border-neutral-300 dark:border-neutral-700"
      />
      {label}
    </label>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <TextInput
      label={label}
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))));
      }}
    />
  );
}

function TextLineFields({
  text,
  onChange,
  onRemove,
}: {
  text: BadgeText;
  onChange: (t: BadgeText) => void;
  onRemove: () => void;
}) {
  const width =
    text.font === "pixel" || text.font === "tiny" ? measureBitmapText(text.text, text.font) : null;
  const bitmap = width !== null;
  return (
    <div className="space-y-3 rounded-md bg-neutral-50 p-3 dark:bg-neutral-800/50">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <TextInput
          label="Text"
          value={text.text}
          maxLength={40}
          onChange={(e) => onChange({ ...text, text: e.target.value })}
          help={
            width !== null && width > BADGE_WIDTH - 4
              ? `This is ${width}px wide - wider than the badge. Try the tiny font or fewer letters.`
              : undefined
          }
        />
        <Select
          label="Font"
          value={text.font}
          options={FONT_OPTIONS}
          onChange={(e) => onChange({ ...text, font: e.target.value as BadgeFont })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <ColorInput
          label="Color"
          value={text.color}
          onChange={(color) => onChange({ ...text, color })}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(text.shadow)}
            onChange={(e) =>
              onChange({ ...text, shadow: e.target.checked ? "#000000" : undefined })
            }
          />
          Shadow
        </label>
        {text.shadow ? (
          <ColorInput
            label="Shadow color"
            value={text.shadow}
            onChange={(shadow) => onChange({ ...text, shadow })}
          />
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Select
          label="Align"
          value={text.align}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
          ]}
          onChange={(e) => onChange({ ...text, align: e.target.value as BadgeText["align"] })}
        />
        <NumberInput
          label="Across (x)"
          value={text.x}
          min={-BADGE_WIDTH}
          max={BADGE_WIDTH * 2}
          onChange={(x) => onChange({ ...text, x })}
        />
        <NumberInput
          label="Down (y)"
          value={text.y}
          min={-BADGE_HEIGHT}
          max={BADGE_HEIGHT * 2}
          onChange={(y) => onChange({ ...text, y })}
        />
        {bitmap ? null : (
          <NumberInput
            label="Size (px)"
            value={text.size}
            min={6}
            max={31}
            onChange={(size) => onChange({ ...text, size })}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            onChange({
              ...text,
              align: "center",
              x: Math.round(BADGE_WIDTH / 2),
              y: Math.round((BADGE_HEIGHT - textHeight(text)) / 2),
            })
          }
        >
          Center on badge
        </Button>
        <Button size="sm" variant="ghost" onClick={onRemove}>
          <Trash2 size={14} /> Remove text
        </Button>
      </div>
    </div>
  );
}

function FocusSlider({
  label,
  ends,
  value,
  onChange,
}: {
  label: string;
  ends: [string, string];
  value: number | undefined;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={value ?? 50}
        onChange={(e) => onChange(Number(e.target.value))}
        className="block w-full"
      />
      <span className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </span>
    </label>
  );
}

function DesignFields({
  source,
  pictureSize,
  onChange,
}: {
  source: BadgeSource;
  /** Natural size of the loaded picture, once it has loaded. */
  pictureSize?: { width: number; height: number };
  onChange: (s: BadgeSource) => void;
}) {
  const bg = source.background;
  const image = source.image;
  // Only offer to shift the picture along an axis where it doesn't exactly fill its box.
  const placed =
    image && pictureSize ? fitRect(image, pictureSize.width, pictureSize.height) : null;
  const shiftX = Boolean(image && placed && image.fit !== "stretch" && placed.w !== image.w);
  const shiftY = Boolean(image && placed && image.fit !== "stretch" && placed.h !== image.h);
  return (
    <div className="space-y-4">
      <Section title="Background">
        <div className="flex flex-wrap items-center gap-4">
          <ColorInput
            label={bg.to ? "Top / left" : "Color"}
            value={bg.from}
            onChange={(from) => onChange({ ...source, background: { ...bg, from } })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(bg.to)}
              onChange={(e) =>
                onChange({
                  ...source,
                  background: e.target.checked
                    ? { from: bg.from, to: "#ffffff", direction: "vertical" }
                    : { from: bg.from },
                })
              }
            />
            Gradient
          </label>
          {bg.to ? (
            <>
              <ColorInput
                label="Bottom / right"
                value={bg.to}
                onChange={(to) => onChange({ ...source, background: { ...bg, to } })}
              />
              <Select
                label="Direction"
                value={bg.direction ?? "vertical"}
                options={[
                  { value: "vertical", label: "Top to bottom" },
                  { value: "horizontal", label: "Left to right" },
                ]}
                onChange={(e) =>
                  onChange({
                    ...source,
                    background: { ...bg, direction: e.target.value as "vertical" | "horizontal" },
                  })
                }
              />
            </>
          ) : null}
        </div>
      </Section>

      <Section title="Picture (optional)">
        <MediaField
          label="Picture"
          value={image?.media}
          help="Drawn over the background. Pixel art stays crisp; photos are smoothed when shrunk."
          onChange={(rkey) =>
            onChange({
              ...source,
              image: rkey
                ? {
                    media: rkey,
                    fit: image?.fit ?? "contain",
                    x: 0,
                    y: 0,
                    w: BADGE_WIDTH,
                    h: BADGE_HEIGHT,
                  }
                : undefined,
            })
          }
        />
        {image ? (
          <>
            <Select
              label="Fit"
              value={image.fit}
              options={[
                { value: "contain", label: "Fit inside (no cropping)" },
                { value: "cover", label: "Fill (crop the edges)" },
                { value: "stretch", label: "Stretch" },
              ]}
              onChange={(e) =>
                onChange({ ...source, image: { ...image, fit: e.target.value as BadgeFit } })
              }
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <NumberInput
                label="Across (x)"
                value={image.x}
                min={-BADGE_WIDTH}
                max={BADGE_WIDTH}
                onChange={(x) => onChange({ ...source, image: { ...image, x } })}
              />
              <NumberInput
                label="Down (y)"
                value={image.y}
                min={-BADGE_HEIGHT}
                max={BADGE_HEIGHT}
                onChange={(y) => onChange({ ...source, image: { ...image, y } })}
              />
              <NumberInput
                label="Width"
                value={image.w}
                min={1}
                max={BADGE_WIDTH * 4}
                onChange={(w) => onChange({ ...source, image: { ...image, w } })}
              />
              <NumberInput
                label="Height"
                value={image.h}
                min={1}
                max={BADGE_HEIGHT * 4}
                onChange={(h) => onChange({ ...source, image: { ...image, h } })}
              />
            </div>
            {shiftX || shiftY ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {shiftY ? (
                  <FocusSlider
                    label={
                      image.fit === "cover" ? "Show which part (up/down)" : "Position (up/down)"
                    }
                    ends={["Top", "Bottom"]}
                    value={image.focusY}
                    onChange={(focusY) => onChange({ ...source, image: { ...image, focusY } })}
                  />
                ) : null}
                {shiftX ? (
                  <FocusSlider
                    label={
                      image.fit === "cover"
                        ? "Show which part (side to side)"
                        : "Position (side to side)"
                    }
                    ends={["Left", "Right"]}
                    value={image.focusX}
                    onChange={(focusX) => onChange({ ...source, image: { ...image, focusX } })}
                  />
                ) : null}
              </div>
            ) : null}
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              The picture fits into this box. Make it smaller (like 31x31) to leave room for text
              beside it.
            </p>
          </>
        ) : null}
      </Section>

      <Section title="Border">
        <div className="flex flex-wrap items-end gap-4">
          <Select
            label="Style"
            value={source.border}
            options={[
              { value: "none", label: "None" },
              { value: "line", label: "Line" },
              { value: "bevel", label: "Raised (classic)" },
              { value: "inset", label: "Sunken" },
            ]}
            onChange={(e) => onChange({ ...source, border: e.target.value as BadgeBorder })}
          />
          {source.border !== "none" ? (
            <ColorInput
              label="Color"
              value={source.borderColor}
              onChange={(borderColor) => onChange({ ...source, borderColor })}
            />
          ) : null}
        </div>
      </Section>

      <Section title="Text">
        {source.texts.map((t, i) => (
          <TextLineFields
            key={i}
            text={t}
            onChange={(next) =>
              onChange({ ...source, texts: source.texts.map((x, j) => (j === i ? next : x)) })
            }
            onRemove={() => onChange({ ...source, texts: source.texts.filter((_, j) => j !== i) })}
          />
        ))}
        {source.texts.length < BADGE_MAX_TEXTS ? (
          <Button
            size="sm"
            onClick={() =>
              onChange({
                ...source,
                texts: [
                  ...source.texts,
                  {
                    text: "",
                    color: "#ffffff",
                    font: "pixel",
                    size: 10,
                    x: Math.round(BADGE_WIDTH / 2),
                    y: source.texts.length ? 18 : 12,
                    align: "center",
                  },
                ],
              })
            }
          >
            <Plus size={14} /> Add a line of text
          </Button>
        ) : null}
      </Section>
    </div>
  );
}

function Preview({ url }: { url: string | null }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Preview</p>
      <div className="flex flex-wrap items-end gap-4 rounded-lg bg-[repeating-conic-gradient(#e5e5e5_0_25%,#fafafa_0_50%)] bg-[length:16px_16px] p-3">
        {[1, 2, 3].map((scale) => (
          <figure key={scale} className="space-y-1 text-center">
            {url ? (
              <img
                src={url}
                alt=""
                width={BADGE_WIDTH * scale}
                height={BADGE_HEIGHT * scale}
                style={{ imageRendering: "pixelated" }}
              />
            ) : (
              <div style={{ width: BADGE_WIDTH * scale, height: BADGE_HEIGHT * scale }} />
            )}
            <figcaption className="text-xs text-neutral-600">{scale}x</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

export function BadgeMaker({ start, onDone }: { start: MakerStart; onDone: () => void }) {
  const { bundle, upsertMedia, upsertBadge } = useEditorState();
  const existing = start.kind === "edit" ? start.badge : null;
  const [source, setSource] = useState<BadgeSource>(() => initialSource(start));
  // A design is only saved if the badge was composed here (not for an uploaded badge touched up in Pixels).
  const [hasDesign, setHasDesign] = useState(
    () => start.kind !== "edit" || Boolean(existing?.value.source),
  );
  const [mode, setMode] = useState<Mode>(() =>
    existing && (!existing.value.source || existing.value.source.pixelEdited) ? "pixels" : "design",
  );
  const [pixels, setPixels] = useState<Pixels | null>(null);
  const [images, setImages] = useState<LoadedPictures>(new Map());
  const [details, setDetails] = useState<BadgeDetails>(() => initialDetails(start));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  if (!canvasRef.current && typeof document !== "undefined") canvasRef.current = newCanvas();

  const mediaUrl = useMemo(() => new Map(bundle.media.map((m) => [m.rkey, m.url])), [bundle.media]);

  // Editing a badge that was touched up (or uploaded): start from its saved image.
  useEffect(() => {
    if (mode !== "pixels" || pixels || !existing) return;
    const url = mediaUrl.get(existing.value.media);
    if (!url) {
      setError("This badge's image was deleted. Switch to Design to make a new one.");
      setPixels({
        width: BADGE_WIDTH,
        height: BADGE_HEIGHT,
        data: new Uint8ClampedArray(BADGE_WIDTH * BADGE_HEIGHT * 4),
      });
      return;
    }
    pixelsOfUrl(url)
      .then(setPixels)
      .catch(() => setError("Couldn't load this badge's image."));
  }, [mode, pixels, existing, mediaUrl]);

  // Load the design's picture once, for drawing.
  const pictureRkey = source.image?.media;
  useEffect(() => {
    if (!pictureRkey || images.has(pictureRkey)) return;
    const url = mediaUrl.get(pictureRkey);
    if (!url) return;
    let live = true;
    loadImage(url)
      .then((img) => live && setImages((m) => new Map(m).set(pictureRkey, img)))
      .catch(() => live && setError("Couldn't load that picture."));
    return () => {
      live = false;
    };
  }, [pictureRkey, images, mediaUrl]);

  // Redraw the preview whenever the design or pixels change.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (mode === "pixels") {
      if (!pixels) return;
      ctx.putImageData(
        new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
        0,
        0,
      );
    } else {
      drawBadge(ctx, source, images);
    }
    try {
      setPreviewUrl(canvas.toDataURL("image/png"));
    } catch {
      setError("A picture couldn't be used (it didn't load from Apollo). Try choosing it again.");
    }
  }, [mode, source, images, pixels]);

  const toPixels = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    drawBadge(ctx, source, images);
    setPixels(pixelsFrom(canvas));
    setMode("pixels");
  };

  const toDesign = () => {
    if (
      pixels &&
      !globalThis.confirm(
        "Go back to the design? Changes made in Pixels will be lost - the design doesn't include them.",
      )
    ) {
      return;
    }
    setPixels(null);
    setHasDesign(true);
    setMode("design");
  };

  const detailsError = badgeDetailsError(details);
  // Don't save a design whose picture hasn't been drawn yet.
  const pictureLoading =
    mode === "design" && Boolean(pictureRkey) && !images.has(pictureRkey as string);

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas || busy || detailsError) return;
    setBusy(true);
    setError(null);
    try {
      const file = await canvasToPng(canvas);
      const alt = details.noAlt ? null : details.alt.trim();
      const { media } = await api.uploadMedia(file, alt, {
        width: BADGE_WIDTH,
        height: BADGE_HEIGHT,
      });
      upsertMedia(media);
      const input: BadgeInput = {
        media: media.rkey,
        alt: alt ?? "",
        ...(details.noAlt ? { noAlt: true } : {}),
        href: details.href.trim() || undefined,
        source: hasDesign
          ? {
              ...source,
              ...(mode === "pixels" ? { pixelEdited: true as const } : { pixelEdited: undefined }),
            }
          : undefined,
      };
      const res = existing
        ? await api.updateBadge(existing.rkey, input)
        : await api.createBadge(input);
      upsertBadge(res.badge);
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiFailure ? err.message : "Couldn't save the badge. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-4 -mt-4 space-y-3 border-b border-neutral-200 bg-white px-4 pt-4 pb-3 dark:border-neutral-800 dark:bg-neutral-900">
        <Preview url={previewUrl} />
        <div className="flex gap-1" role="tablist" aria-label="Editing mode">
          {(
            [
              ["design", "Design", toDesign],
              ["pixels", "Pixels", toPixels],
            ] as const
          ).map(([id, label, go]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => mode !== id && go()}
              className={`rounded-md px-3 py-1.5 text-sm ${
                mode === id
                  ? "bg-sky-100 font-medium text-sky-900 dark:bg-sky-950 dark:text-sky-100"
                  : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "design" ? (
        <DesignFields
          source={source}
          pictureSize={pictureRkey ? images.get(pictureRkey) : undefined}
          onChange={setSource}
        />
      ) : pixels ? (
        <PixelPainter value={pixels} onChange={setPixels} />
      ) : (
        <p className="text-sm text-neutral-500">Loading...</p>
      )}

      <Section title="Details">
        <BadgeDetailsFields value={details} onChange={setDetails} />
      </Section>

      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={busy || Boolean(detailsError) || !previewUrl || pictureLoading}
          onClick={save}
        >
          {busy ? "Saving..." : existing ? "Save changes" : "Save badge"}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        {detailsError ? <span className="text-xs text-rose-600">{detailsError}</span> : null}
      </div>
      <p className="text-xs text-neutral-500">
        The image is saved as an 88x31 PNG in your Bluesky account and is public, like posts.
      </p>
    </div>
  );
}
