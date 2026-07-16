import { useEffect, useState } from "react";

/**
 * Object URL for a Blob/File that survives React Strict Mode.
 * Creating the URL inside an effect (not useMemo) so remount recreates
 * after the forced cleanup revoke — useMemo + effect-revoke blanks <img>.
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);

  return url;
}
