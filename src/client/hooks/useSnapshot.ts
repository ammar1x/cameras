import { useCallback } from 'react';

interface UseSnapshotOptions {
  filename?: string;
  format?: 'png' | 'jpeg';
  quality?: number; // 0-1 for jpeg
}

export function useSnapshot() {
  const takeSnapshot = useCallback(
    (canvas: HTMLCanvasElement | null, options: UseSnapshotOptions = {}) => {
      if (!canvas) return null;

      const { filename, format = 'png', quality = 0.92 } = options;

      // Create a timestamp-based filename if not provided
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const defaultFilename = `snapshot-${timestamp}`;
      const finalFilename = filename || defaultFilename;

      // Get canvas data as data URL
      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const dataUrl = canvas.toDataURL(mimeType, quality);

      // Create a download link
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${finalFilename}.${format}`;

      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      return dataUrl;
    },
    []
  );

  const copyToClipboard = useCallback(
    async (canvas: HTMLCanvasElement | null): Promise<boolean> => {
      if (!canvas) return false;

      try {
        // Convert canvas to blob
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, 'image/png');
        });

        if (!blob) return false;

        // Copy to clipboard
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);

        return true;
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
        return false;
      }
    },
    []
  );

  return { takeSnapshot, copyToClipboard };
}
