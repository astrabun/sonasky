import { useEffect, useRef } from "react";
import { useLocalStorage } from "./useLocalStorage";

export interface UrlCodec<T> {
  /** Return null to omit the param from the URL (i.e. value equals the default). */
  toParam: (value: T) => string | null;
  fromParam: (raw: string) => T;
}

/**
 * Like useLocalStorage, but a URL query param takes priority over the stored
 * value on first load - so opening a shared/copied link reproduces exactly
 * what the sharer had selected, regardless of the viewer's own local
 * preferences. Falls back to localStorage, then initialValue, same as
 * useLocalStorage. The param is kept in sync with the value afterward.
 */
export function useUrlSyncedState<T>(key: string, initialValue: T, codec: UrlCodec<T>) {
  const [value, setValue] = useLocalStorage<T>(key, initialValue);
  const hasCheckedUrl = useRef(false);

  useEffect(() => {
    if (!hasCheckedUrl.current) {
      hasCheckedUrl.current = true;
      const raw = new URLSearchParams(window.location.search).get(key);
      if (raw !== null) {
        setValue(codec.fromParam(raw));
        return; // the next render (after setValue) will write this back out below
      }
    }

    const url = new URL(window.location.href);
    const param = codec.toParam(value);
    if (param === null) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, param);
    }
    window.history.replaceState(null, "", url);
    // codec is expected to be a stable/inline object per call site, not reactive state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);

  return [value, setValue] as const;
}

/** Plain string, omitted from the URL when it equals defaultValue. */
export function stringCodec(defaultValue: string): UrlCodec<string> {
  return {
    toParam: (value) => (value === defaultValue ? null : value),
    fromParam: (raw) => raw,
  };
}

/** Comma-separated list, omitted from the URL when empty. */
export const arrayCodec: UrlCodec<string[]> = {
  toParam: (value) => (value.length === 0 ? null : value.join(",")),
  fromParam: (raw) => (raw === "" ? [] : raw.split(",")),
};
