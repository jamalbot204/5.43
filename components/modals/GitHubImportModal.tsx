import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { CheckIcon, CloseIcon as CancelIcon, GitHubIcon, LinkIcon, DocumentIcon, ChevronDownIcon, ChevronRightIcon, FolderOpenIcon } from '../common/Icons.tsx';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Switch } from '../ui/Switch.tsx';
import { useTranslation } from '../../hooks/useTranslation.ts';

interface GitHubImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (url: string, selectedFiles?: string[]) => void;
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children: FileNode[];
}

const buildTree = (paths: string[]): FileNode[] => {
  const root: FileNode = { name: 'root', path: '', type: 'dir', children: [] };
  paths.forEach(path => {
    const parts = path.split('/');
    let current = root;
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const currentPath = parts.slice(0, index + 1).join('/');
      let child = current.children.find(c => c.name === part);
      if (!child) {
        child = { name: part, path: currentPath, type: isFile ? 'file' : 'dir', children: [] };
        current.children.push(child);
      }
      current = child;
    });
  });
  const sortTree = (node: FileNode) => {
    node.children.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'dir' ? -1 : 1;
    });
    node.children.forEach(sortTree);
  };
  sortTree(root);
  return root.children;
};

const TreeNodeComponent: React.FC<{
  node: FileNode;
  selectedFiles: Set<string>;
  onToggleFile: (path: string) => void;
  onToggleFolder: (path: string, select: boolean, descendantFiles: string[]) => void;
  searchQuery: string;
  level: number;
}> = ({ node, selectedFiles, onToggleFile, onToggleFolder, searchQuery, level }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const descendantFiles = React.useMemo(() => {
    const getFiles = (n: FileNode): string[] => {
      if (n.type === 'file') return [n.path];
      return n.children.flatMap(getFiles);
    };
    return getFiles(node);
  }, [node]);

  const matchesSearch = React.useMemo(() => {
    if (!searchQuery) return true;
    if (node.type === 'file') return node.path.toLowerCase().includes(searchQuery.toLowerCase());
    return descendantFiles.some(f => f.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [node, descendantFiles, searchQuery]);

  React.useEffect(() => {
    if (searchQuery && matchesSearch && node.type === 'dir') {
      setIsExpanded(true);
    } else if (!searchQuery) {
      setIsExpanded(false);
    }
  }, [searchQuery, matchesSearch, node.type]);

  if (!matchesSearch) return null;

  if (node.type === 'file') {
    return (
      <div className={`flex items-center py-1 px-2 hover:bg-bg-hover rounded-md cursor-pointer ${level === 0 ? '' : 'ml-4'}`} onClick={() => onToggleFile(node.path)}>
        <Switch
          checked={selectedFiles.has(node.path)}
          onChange={() => onToggleFile(node.path)}
          onClick={(e) => e.stopPropagation()}
          className="mr-3 rounded border-border-base bg-bg-element text-brand-primary focus:ring-ring-focus"
        />
        <DocumentIcon className="w-4 h-4 mr-2 text-text-muted flex-shrink-0" />
        <span className="text-sm text-text-secondary font-mono truncate">{node.name}</span>
      </div>
    );
  }

  const selectedCount = descendantFiles.filter(f => selectedFiles.has(f)).length;
  const isAllSelected = selectedCount === descendantFiles.length && descendantFiles.length > 0;
  const isIndeterminate = selectedCount > 0 && selectedCount < descendantFiles.length;

  return (
    <div className={`${level === 0 ? '' : 'ml-4'}`}>
      <div 
        className="flex items-center py-1 px-2 hover:bg-bg-hover rounded-md cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="mr-1 flex-shrink-0" onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}>
          {isExpanded ? <ChevronDownIcon className="w-4 h-4 text-text-muted" /> : <ChevronRightIcon className="w-4 h-4 text-text-muted" />}
        </div>
        <input
          type="checkbox"
          checked={isAllSelected}
          ref={input => { if (input) input.indeterminate = isIndeterminate; }}
          onChange={(e) => {
            onToggleFolder(node.path, e.target.checked, descendantFiles);
          }}
          onClick={(e) => e.stopPropagation()}
          className="mr-3 rounded border-border-base bg-bg-element text-brand-primary focus:ring-ring-focus"
        />
        <FolderOpenIcon className="w-4 h-4 mr-2 text-brand-primary flex-shrink-0" />
        <span className="text-sm text-text-primary font-mono font-medium truncate">{node.name}</span>
        <span className="ml-2 text-xs text-text-muted flex-shrink-0">({selectedCount}/{descendantFiles.length})</span>
      </div>
      {isExpanded && (
        <div className="border-l border-border-base ml-2 pl-2">
          {node.children.map(child => (
            <TreeNodeComponent 
              key={child.path} 
              node={child} 
              selectedFiles={selectedFiles} 
              onToggleFile={onToggleFile} 
              onToggleFolder={onToggleFolder}
              searchQuery={searchQuery}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const GitHubImportModal: React.FC<GitHubImportModalProps> = memo(({ isOpen, onClose, onImport }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2>(1);
  const [url, setUrl] = useState('');
  const [isValid, setIsValid] = useState(false);
  const [areButtonsDisabled, setAreButtonsDisabled] = useState(true);
  const [isFetchingTree, setIsFetchingTree] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  const GITHUB_REPO_REGEX = /^(https?:\/\/)?(www\.)?github\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-._]+(\/)?$/;

  useEffect(() => {
    if (isOpen) {
      setAreButtonsDisabled(true);
      const timerId = setTimeout(() => {
        setAreButtonsDisabled(false);
      }, 500);

      setStep(1);
      setUrl('');
      setIsValid(false);
      setFiles([]);
      setSelectedFiles(new Set());
      setSearchQuery('');
      setFetchError(null);
      setTimeout(() => inputRef.current?.focus(), 100);

      return () => clearTimeout(timerId);
    }
  }, [isOpen]);

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    setIsValid(GITHUB_REPO_REGEX.test(newUrl));
    setFetchError(null);
  }, [GITHUB_REPO_REGEX]);

  const fetchRepoTree = async () => {
    setIsFetchingTree(true);
    setFetchError(null);
    try {
      const cleanUrlString = url.endsWith('.git') ? url.slice(0, -4) : url;
      const urlObject = new URL(cleanUrlString);
      const urlParts = urlObject.pathname.split('/').filter(Boolean);
      if (urlParts.length < 2) throw new Error("Invalid GitHub URL");
      const [owner, repo] = urlParts;
      
      const repoInfoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
      if (!repoInfoResponse.ok) throw new Error("Failed to fetch repository info. Make sure it's public.");
      const repoInfo = await repoInfoResponse.json();
      const defaultBranch = repoInfo.default_branch || 'main';
      
      const treeResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`);
      if (!treeResponse.ok) throw new Error("Failed to fetch repository tree.");
      const treeData = await treeResponse.json();
      
      const filePaths = treeData.tree
        .filter((item: any) => item.type === 'blob')
        .map((item: any) => item.path);
        
      setFiles(filePaths);
      setSelectedFiles(new Set(filePaths)); // Select all by default
      setStep(2);
    } catch (error: any) {
      setFetchError(error.message || "An error occurred while fetching the repository.");
    } finally {
      setIsFetchingTree(false);
    }
  };

  const handleNext = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (isValid) {
      fetchRepoTree();
    }
  }, [isValid, url]);

  const handleImport = useCallback(() => {
    onImport(url, Array.from(selectedFiles));
  }, [onImport, url, selectedFiles]);

  const toggleFileSelection = useCallback((path: string) => {
    setSelectedFiles(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(path)) {
        newSelected.delete(path);
      } else {
        newSelected.add(path);
      }
      return newSelected;
    });
  }, []);

  const toggleFolderSelection = useCallback((path: string, select: boolean, descendantFiles: string[]) => {
    setSelectedFiles(prev => {
      const newSelected = new Set(prev);
      if (select) {
        descendantFiles.forEach(f => newSelected.add(f));
      } else {
        descendantFiles.forEach(f => newSelected.delete(f));
      }
      return newSelected;
    });
  }, []);

  const toggleAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files));
    }
  };

  const fileTree = React.useMemo(() => buildTree(files), [files]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-bg-overlay/80 z-50 flex justify-center items-center p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="github-import-modal-title"
      onClick={onClose}
    >
      <div 
        className="bg-bg-panel backdrop-blur-xl border border-border-base p-6 rounded-2xl shadow-panel w-full sm:max-w-xl max-h-[90vh] flex flex-col text-text-primary animate-modal-open" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 id="github-import-modal-title" className="text-lg font-semibold text-text-primary flex items-center">
            <GitHubIcon className="w-5 h-5 mr-3 text-text-primary" />
            {step === 1 ? t.importGithubRepo : "Select Files to Import"}
          </h2>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={areButtonsDisabled || isFetchingTree}
            className="p-1 rounded-full text-text-secondary hover:text-text-primary bg-bg-element hover:bg-bg-hover"
            aria-label={t.close}
          >
            <CancelIcon className="w-5 h-5" />
          </Button>
        </div>

        {step === 1 ? (
          <form onSubmit={handleNext}>
              {/* Input Card - Slate */}
              <div className="relative p-4 mb-6 rounded-r-xl rounded-l-md border border-border-base border-l-4 border-l-brand-primary bg-gradient-to-r from-brand-primary/5 to-transparent backdrop-blur-sm shadow-sm">
                  <p className="text-xs text-text-secondary mb-3">
                      {t.githubRepoDesc}
                  </p>
                  <div className="relative">
                      <Input
                          ref={inputRef}
                          type="text"
                          value={url}
                          onChange={handleUrlChange}
                          disabled={isFetchingTree}
                          className="font-mono bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus"
                          aria-label={t.githubRepoUrl}
                          placeholder="https://github.com/username/repo"
                          icon={<LinkIcon className="h-4 w-4 text-text-muted" />}
                      />
                  </div>
                  {url && !isValid && (
                      <p className="text-xs text-tint-red-text mt-2">Invalid GitHub Repository URL format.</p>
                  )}
                  {fetchError && (
                      <p className="text-xs text-tint-red-text mt-2">{fetchError}</p>
                  )}
              </div>

            <div className="flex justify-end space-x-3">
              <Button
                variant="secondary"
                type="button"
                onClick={onClose}
                disabled={areButtonsDisabled || isFetchingTree}
                icon={<CancelIcon className="w-4 h-4" />}
                className="bg-bg-element border-border-base hover:bg-bg-hover text-text-primary"
              >
                {t.cancel}
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={areButtonsDisabled || !isValid || isFetchingTree}
                isLoading={isFetchingTree}
                icon={<CheckIcon className="w-4 h-4" />}
              >
                Next
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col h-full max-h-[60vh]">
            <div className="mb-4 flex justify-between items-center gap-4">
              <Input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 font-mono bg-bg-element border-border-base focus:border-brand-primary focus:ring-ring-focus"
              />
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={toggleAll}
                className="whitespace-nowrap bg-bg-element border-border-base hover:bg-bg-hover text-text-primary"
              >
                {selectedFiles.size === files.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar border border-border-base rounded-md bg-bg-panel/20 p-2 mb-4 shadow-inner">
              {fileTree.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-4">No files found.</p>
              ) : (
                <div className="space-y-1">
                  {fileTree.map(node => (
                    <TreeNodeComponent
                      key={node.path}
                      node={node}
                      selectedFiles={selectedFiles}
                      onToggleFile={toggleFileSelection}
                      onToggleFolder={toggleFolderSelection}
                      searchQuery={searchQuery}
                      level={0}
                    />
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex justify-between items-center mt-auto pt-2 border-t border-border-base">
              <span className="text-xs text-text-muted">
                {selectedFiles.size} of {files.length} files selected
              </span>
              <div className="flex space-x-3">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setStep(1)}
                  className="bg-bg-element border-border-base hover:bg-bg-hover text-text-primary"
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  type="button"
                  onClick={handleImport}
                  disabled={selectedFiles.size === 0}
                  icon={<CheckIcon className="w-4 h-4" />}
                >
                  {t.import}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default GitHubImportModal;