import React, { memo, useMemo } from 'react';
import { LinkIcon } from '../../common/Icons.tsx';

interface MessageSourcesProps {
  groundingMetadata?: any;
  toolInvocations?: any[];
}

const getHostname = (urlStr: string) => {
  try {
    return new URL(urlStr).hostname;
  } catch {
    return urlStr.substring(0, 20);
  }
};

const MessageSources: React.FC<MessageSourcesProps> = ({ groundingMetadata, toolInvocations }) => {
  const sources = useMemo(() => {
    const allSources: { url: string; title: string }[] = [];

    if (groundingMetadata?.groundingChunks) {
      groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.web?.uri) {
          allSources.push({
            url: chunk.web.uri,
            title: chunk.web.title || chunk.web.uri,
          });
        }
      });
    }

    if (toolInvocations) {
      toolInvocations.forEach((invocation: any) => {
        if (invocation.toolName === 'read_webpage' && !invocation.isError && invocation.args?.url) {
          allSources.push({
            url: invocation.args.url,
            title: invocation.result?.title || invocation.args.url,
          });
        } else if (invocation.toolName === 'search_web' && !invocation.isError && invocation.result?.search_results) {
          invocation.result.search_results.forEach((res: any) => {
            if (res.url) {
              allSources.push({
                url: res.url,
                title: res.title || res.url
              });
            }
          });
        }
      });
    }

    // Deduplicate by URL
    return Array.from(new Map(allSources.map(s => [s.url, s])).values());
  }, [groundingMetadata, toolInvocations]);

  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 pt-3 border-t border-border-light">
      <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2 opacity-60 flex items-center">
        <LinkIcon className="w-3 h-3 mr-1.5" /> Sources
      </h4>
      <div className="flex overflow-x-auto gap-2 pb-2 custom-scrollbar">
        {sources.map((source, index) => (
          <a
            key={index}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-2 rounded-xl bg-bg-element border border-border-base hover:bg-bg-hover hover:border-brand-primary/50 transition-colors min-w-[200px] max-w-[280px] flex-shrink-0 group decoration-transparent"
          >
            <img
              src={`https://www.google.com/s2/favicons?domain=${getHostname(source.url)}&sz=32`}
              alt=""
              className="w-6 h-6 rounded-md flex-shrink-0 bg-bg-panel p-0.5"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-text-primary truncate group-hover:text-brand-primary transition-colors">
                {source.title || source.url}
              </span>
              <span className="text-[10px] text-text-muted truncate">
                {getHostname(source.url)}
              </span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

export default memo(MessageSources);
