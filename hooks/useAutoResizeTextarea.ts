// hooks/useAutoResizeTextarea.ts
import { useEffect, useRef, RefObject } from 'react';

const useAutoResizeTextarea = <T extends HTMLTextAreaElement>(
  value: string, // Value to observe for changes that might affect height
  maxHeight: number = 120 // Default max height in pixels
): RefObject<T> => {
  const textareaRef = useRef<T>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Temporarily reset height to auto. This is crucial:
      // - It allows the textarea to shrink if text is deleted.
      // - It allows the textarea to grow if text is added (scrollHeight will be calculated based on content).
      // - If `value` is empty, this makes the textarea revert to its intrinsic size defined by CSS and `rows` attribute.
      textarea.style.height = 'auto';
      // Default to hidden scrollbar, will be overridden if maxHeight is exceeded by content
      textarea.style.overflowY = 'hidden';

      const currentScrollHeight = textarea.scrollHeight;

      if (String(value).trim() !== '') { // If there is actual content
        if (currentScrollHeight > maxHeight) {
          textarea.style.height = `${maxHeight}px`;
          textarea.style.overflowY = 'auto'; // Show scrollbar as content exceeds max height
        } else {
          textarea.style.height = `${currentScrollHeight}px`;
          // textarea.style.overflowY = 'hidden'; // Already set, keep hidden as content fits
        }
      } else {
        // If value is empty, `height` remains 'auto' (set above).
        // The `rows="1"` attribute and CSS padding will determine its small size.
        // Ensure `overflowY` is hidden when empty and small.
        textarea.style.overflowY = 'hidden';
      }
    }
  }, [value, maxHeight]); // Rerun when value or maxHeight changes

  return textareaRef;
};

export default useAutoResizeTextarea;