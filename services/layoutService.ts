// services/layoutService.ts
const LAYOUT_DIRECTION_KEY = 'appLayoutDirection';

export function getLayoutDirection(): 'ltr' | 'rtl' {
  if (typeof window !== 'undefined') {
    return (localStorage.getItem(LAYOUT_DIRECTION_KEY) as 'ltr' | 'rtl') || 'rtl';
  }
  return 'rtl';
}

export function setLayoutDirection(direction: 'ltr' | 'rtl'): void {
  if (typeof window !== 'undefined') {
    document.documentElement.dir = direction;
    localStorage.setItem(LAYOUT_DIRECTION_KEY, direction);
    // Dispatch a custom event that App.tsx can listen to.
    window.dispatchEvent(new CustomEvent('layoutDirectionChange', { detail: direction }));
  }
}

export function toggleLayoutDirection(): void {
  const currentDirection = getLayoutDirection();
  setLayoutDirection(currentDirection === 'ltr' ? 'rtl' : 'ltr');
}

export function initializeLayout(): void {
  // Ensures the dir attribute is set on initial load based on localStorage or default.
  // No need to dispatch event here as App.tsx will read initial state.
  if (typeof window !== 'undefined') {
    document.documentElement.dir = getLayoutDirection();
  }
}