import { useState, useEffect, useRef, RefObject, MutableRefObject } from 'react';

interface UseLazyLoadOptions {
  rootMargin?: string;
  threshold?: number;
  unloadDelay?: number; // Delay before unloading when out of view
}

export function useLazyLoad<T extends HTMLElement>(
  options: UseLazyLoadOptions = {}
): [MutableRefObject<T | null>, boolean] {
  const { rootMargin = '50px', threshold = 0.1, unloadDelay = 1000 } = options;
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);
  const unloadTimerRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Clear any pending unload
          if (unloadTimerRef.current) {
            clearTimeout(unloadTimerRef.current);
            unloadTimerRef.current = undefined;
          }
          setIsVisible(true);
        } else {
          // Delay unloading to avoid flickering during scroll
          unloadTimerRef.current = setTimeout(() => {
            setIsVisible(false);
          }, unloadDelay);
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
      if (unloadTimerRef.current) {
        clearTimeout(unloadTimerRef.current);
      }
    };
  }, [rootMargin, threshold, unloadDelay]);

  return [ref, isVisible];
}
