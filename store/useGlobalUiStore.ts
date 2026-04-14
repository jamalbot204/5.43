
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as layoutService from '../services/layoutService.ts';

type Theme = 'light' | 'dark' | 'studio';
type Language = 'en' | 'ar';

interface GlobalUiState {
  isSidebarOpen: boolean;
  layoutDirection: 'ltr' | 'rtl';
  theme: Theme;
  language: Language;
  chatFontSizeLevel: number; // 0 to 4
  readModeFontSizeLevel: number; // 0 to 6
  toggleSidebar: () => void;
  closeSidebar: () => void;
  toggleLayoutDirection: () => void;
  _setLayoutDirection: (direction: 'ltr' | 'rtl') => void;
  toggleTheme: () => void;
  toggleLanguage: () => void;
  setImportedUiConfig: (theme: Theme, language: Language) => void;
  setChatFontSizeLevel: (level: number) => void;
  setReadModeFontSizeLevel: (level: number) => void;
}

const getInitialSidebarState = (): boolean => {
  if (typeof window !== 'undefined') {
    const storedState = localStorage.getItem('geminiChatSidebarOpen');
    if (storedState !== null) {
      try {
        return JSON.parse(storedState);
      } catch (e) {
        console.warn("Failed to parse sidebar state, resetting to default.", e);
        return false;
      }
    }
    return window.matchMedia('(min-width: 768px)').matches;
  }
  return false;
};

const getInitialFontSize = (mode: 'chat' | 'read'): number => {
  if (typeof window === 'undefined') return 2;
  
  // Check for large screen (Laptop/Desktop - typically 1024px+)
  const isLargeScreen = window.matchMedia('(min-width: 1024px)').matches;

  if (isLargeScreen) {
    // Larger fonts for desktop readability
    return mode === 'read' ? 5 : 3;
  }
  
  // Mobile defaults (Standard)
  return 2;
};

export const useGlobalUiStore = create<GlobalUiState>()(
  persist(
    (set) => ({
      isSidebarOpen: getInitialSidebarState(),
      layoutDirection: layoutService.getLayoutDirection(),
      theme: 'dark', 
      language: 'ar', // Default language
      chatFontSizeLevel: getInitialFontSize('chat'), 
      readModeFontSizeLevel: getInitialFontSize('read'),
      
      toggleSidebar: () => {
        set(state => {
          const newSidebarState = !state.isSidebarOpen;
          localStorage.setItem('geminiChatSidebarOpen', JSON.stringify(newSidebarState));
          return { isSidebarOpen: newSidebarState };
        });
      },
    
      closeSidebar: () => {
        localStorage.setItem('geminiChatSidebarOpen', JSON.stringify(false));
        set({ isSidebarOpen: false });
      },
      
      toggleLayoutDirection: () => {
        layoutService.toggleLayoutDirection();
      },
    
      _setLayoutDirection: (direction: 'ltr' | 'rtl') => {
        set({ layoutDirection: direction });
      },

      toggleTheme: () => {
        set(state => {
          const nextTheme: Theme = state.theme === 'light' ? 'dark' : state.theme === 'dark' ? 'studio' : 'light';
          return { theme: nextTheme };
        });
      },

      toggleLanguage: () => {
        set(state => {
          const newLang = state.language === 'en' ? 'ar' : 'en';
          const newDir = newLang === 'ar' ? 'rtl' : 'ltr';
          // Automatically set layout direction based on language
          layoutService.setLayoutDirection(newDir);
          return { language: newLang };
        });
      },

      setImportedUiConfig: (theme, language) => {
        const newDir = language === 'ar' ? 'rtl' : 'ltr';
        layoutService.setLayoutDirection(newDir);
        set({ theme, language, layoutDirection: newDir });
      },

      setChatFontSizeLevel: (level) => set({ chatFontSizeLevel: level }),
      setReadModeFontSizeLevel: (level) => set({ readModeFontSizeLevel: level }),
    }),
    {
      name: 'global-ui-storage',
      partialize: (state) => ({ 
        theme: state.theme, 
        language: state.language,
        chatFontSizeLevel: state.chatFontSizeLevel,
        readModeFontSizeLevel: state.readModeFontSizeLevel
      }), 
    }
  )
);

if (typeof window !== 'undefined') {
  layoutService.initializeLayout();
  window.addEventListener('layoutDirectionChange', (event: Event) => {
    useGlobalUiStore.getState()._setLayoutDirection((event as CustomEvent).detail);
  });
}
