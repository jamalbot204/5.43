import React, { memo } from 'react';
import { useGenerationTimerStore } from '../../store/useGenerationTimerStore.ts';

const GenerationTimer: React.FC = memo(() => {
  const currentGenerationTimeDisplay = useGenerationTimerStore(state => state.currentGenerationTimeDisplay);
  
  return <span>({currentGenerationTimeDisplay})</span>;
});

export default GenerationTimer;