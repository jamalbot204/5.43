import React, { memo } from 'react';
import { useProgressStore } from '../../store/useProgressStore.ts';
import { CheckCircleIcon, XCircleIcon } from './Icons.tsx';
import { Button } from '../ui/Button.tsx';

const ProgressNotification: React.FC = memo(() => {
  const { progressItems, cancelProgress, removeProgress } = useProgressStore();

  if (progressItems.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed top-4 end-4 z-[100] w-full max-w-[calc(100vw-2rem)] sm:max-w-sm space-y-3"
      aria-live="polite"
    >
      {progressItems.map(item => {
        const isRunning = item.status === 'running';
        const isSuccess = item.status === 'success';
        const isError = item.status === 'error';

        let borderColor = 'border-border-base';
        if (isSuccess) borderColor = 'border-tint-emerald-border/20';
        if (isError) borderColor = 'border-tint-red-border/20';

        return (
          <div
            key={item.id}
            role="alert"
            className={`bg-bg-panel border p-4 rounded-lg shadow-panel flex flex-col transition duration-300 ease-in-out animate-fade-in-right ${borderColor}`}
          >
            <div className="flex justify-between items-start">
              <div className="flex-grow">
                <div className="flex items-center">
                  {isSuccess && <CheckCircleIcon className="w-5 h-5 mr-2 text-tint-emerald-text flex-shrink-0" />}
                  {isError && <XCircleIcon className="w-5 h-5 mr-2 text-tint-red-text flex-shrink-0" />}
                  {isRunning && (
                    <svg className="animate-spin h-5 w-5 mr-2 text-tint-emerald-text flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  <h3 className="text-sm font-semibold text-text-primary">{item.title}</h3>
                </div>
                <p className="text-xs text-text-secondary mt-1">{item.message}</p>
              </div>
              {isRunning && item.onCancel && (
                <Button
                  onClick={() => cancelProgress(item.id)}
                  variant="ghost"
                  size="sm"
                  className="p-1.5 text-xs text-text-secondary hover:text-text-primary rounded-md transition-colors h-auto"
                  aria-label="Cancel process"
                >
                  Cancel
                </Button>
              )}
               {isError && (
                <Button
                  onClick={() => removeProgress(item.id)}
                  variant="ghost"
                  size="sm"
                  className="p-1.5 text-xs text-text-secondary hover:text-text-primary rounded-md transition-colors h-auto"
                  aria-label="Close notification"
                >
                  Close
                </Button>
              )}
            </div>
            {isRunning && (
              <div className="mt-3">
                <div className="w-full bg-bg-element rounded-full h-1.5">
                  <div
                    className="bg-tint-emerald-text h-1.5 rounded-full transition duration-300 ease-linear"
                    style={{ width: `${item.progress}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <style>{`
        @keyframes fade-in-smart {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-fade-in-right {
          animation: fade-in-smart 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
});

export default ProgressNotification;