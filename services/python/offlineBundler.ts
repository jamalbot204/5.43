
/**
 * Offline Python Environment Bundler
 * Fetches necessary Pyodide binary files and Python wheels based on a manifest.
 * Implements Multi-CDN fallback and Retry logic for robustness.
 * Updated for Pyodide v0.26.1 using pyodide-lock.json
 */

const CDN_URLS = [
    "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/",
    "https://pyodide-cdn2.iodide.io/v0.26.1/full/"
];

// Core files needed to boot Pyodide
// Switched from repodata.json to pyodide-lock.json as per v0.26+ structure
const CORE_FILES = [
    "pyodide.js",
    "pyodide.asm.wasm",
    "pyodide.asm.js",
    "pyodide-lock.json",
    "stdlib.zip"
];

export interface BundledFile {
    name: string;
    blob: Blob;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Fetch with retries and CDN fallbacks
async function fetchSmart(
    filename: string,
    onStatus: (msg: string) => void
): Promise<Blob> {
    let lastError: any;

    for (const baseUrl of CDN_URLS) {
        const url = `${baseUrl}${filename}`;
        
        // Try up to 3 times per CDN
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                if (attempt > 1) {
                    onStatus(`Retry ${attempt}/3 for ${filename}...`);
                    await sleep(1000 * attempt); // Exponential backoff
                }

                const response = await fetch(url);
                if (!response.ok) {
                    // If 404, don't retry this URL, move to next CDN immediately
                    if (response.status === 404) throw new Error(`404 Not Found on ${baseUrl}`);
                    throw new Error(`Status ${response.status}`);
                }
                
                return await response.blob();
            } catch (err: any) {
                console.warn(`Failed to fetch ${url} (Attempt ${attempt}):`, err);
                lastError = err;
            }
        }
        
        onStatus(`Mirror failed, switching CDN for ${filename}...`);
    }

    throw lastError || new Error(`Failed to fetch ${filename} from any source.`);
}

export const bundleOfflineEnvironment = async (
    packageManifest: string,
    onProgress: (progress: number, status: string) => void
): Promise<BundledFile[]> => {
    const files: BundledFile[] = [];
    
    // Parse packages first to know total count
    const packages = packageManifest.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

    const totalSteps = CORE_FILES.length + 1 + packages.length; // +1 for lock file processing
    let currentStep = 0;

    const updateProgress = (msg: string) => {
        onProgress((currentStep / totalSteps) * 100, msg);
    };

    // 1. Fetch Core Files
    for (const fileName of CORE_FILES) {
        updateProgress(`Downloading core: ${fileName}`);
        try {
            const blob = await fetchSmart(fileName, (status) => updateProgress(`${fileName}: ${status}`));
            files.push({ name: fileName, blob });
        } catch (e) {
            console.error(`Critical: Failed to bundle ${fileName}`, e);
            throw new Error(`Failed to bundle core file: ${fileName}. Please check internet connection.`);
        }
        currentStep++;
    }

    // 2. Process Packages using pyodide-lock.json
    updateProgress("Analyzing package dependencies...");
    
    // We fetch `pyodide-lock.json` from our downloaded bundle to resolve paths
    const lockFile = files.find(f => f.name === 'pyodide-lock.json');
    
    if (lockFile) {
        const lockText = await lockFile.blob.text();
        const lockData = JSON.parse(lockText);
        const packageMap = lockData.packages; // In lock.json, keys are package names directly

        for (const pkgSpec of packages) {
            // pkgSpec usually looks like "numpy==1.26.4" or just "numpy"
            const [pkgNameRaw, _] = pkgSpec.split('==');
            const pkgName = pkgNameRaw.trim().toLowerCase(); // Normalize
            
            // Find package in lock file
            const pkgInfo = packageMap[pkgName];
            
            if (pkgInfo) {
                const fileName = pkgInfo.file_name; // The wheel filename
                
                updateProgress(`Downloading package: ${pkgName}`);
                
                try {
                    const blob = await fetchSmart(fileName, (status) => updateProgress(`${pkgName}: ${status}`));
                    files.push({ name: fileName, blob });
                } catch (e) {
                    console.warn(`Could not bundle optional package ${pkgName}:`, e);
                    // We don't throw here, allowing partial bundle if a specific lib fails
                }
            } else {
                console.warn(`Package ${pkgName} not found in pyodide-lock.json. It might be a micropip-only package not in core dist.`);
            }
            currentStep++;
        }
    } else {
        throw new Error("Critical: pyodide-lock.json missing from bundle operations.");
    }

    // 3. Create Manifest
    const manifest = {
        created_at: new Date().toISOString(),
        packages: packages,
        core_files: CORE_FILES,
        version: "0.26.1"
    };
    files.push({ 
        name: "manifest.json", 
        blob: new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }) 
    });

    onProgress(100, "Bundling complete.");
    return files;
};
