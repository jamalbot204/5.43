
import React, { useEffect, memo } from 'react';
import AppContent from './components/AppContent.tsx';
import DummyAudio from './components/audio/DummyAudio.tsx';
import { useGlobalUiStore } from './store/useGlobalUiStore.ts';

const App: React.FC = memo(() => {
  const theme = useGlobalUiStore(state => state.theme);

  useEffect(() => {
    document.documentElement.classList.remove('dark', 'studio');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'studio') {
      document.documentElement.classList.add('studio');
    }
  }, [theme]);

  return (
    <>
      <DummyAudio />
      <AppContent />
    </>
  );
});

export default App;
