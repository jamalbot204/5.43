
import { useToastStore } from '../store/useToastStore.ts';

export const clearCacheAndReload = async () => {
    const showToast = useToastStore.getState().showToast;

    console.log("Attempting to clear cache and hard reload with a 5-second timeout...");
    showToast("Starting hard reload process...", "success", 5000);

    const cleanupPromise = (async () => {
        if ('serviceWorker' in navigator) {
            try {
                console.log("Getting service worker registrations...");
                const registrations = await navigator.serviceWorker.getRegistrations();
                if (registrations.length > 0) {
                    console.log(`Found ${registrations.length} service worker(s). Unregistering...`);
                    showToast(`Unregistering ${registrations.length} service worker(s)...`, "success", 5000);
                    await Promise.all(registrations.map(reg => reg.unregister()));
                    console.log("Service workers unregistration process initiated.");
                    showToast("Service workers unregistered.", "success", 2000);
                } else {
                    console.log("No service workers found to unregister.");
                }
            } catch (error) {
                console.error('Error unregistering service worker:', error);
                showToast("Error unregistering service workers.", "error", 5000);
            }
        } else {
            console.log("Service Worker API not supported.");
        }

        if ('caches' in window) {
            try {
                console.log("Getting cache keys...");
                const keys = await caches.keys();
                if (keys.length > 0) {
                    console.log(`Found ${keys.length} cache(s). Deleting...`);
                    showToast(`Deleting ${keys.length} cache(s)...`, "success", 5000);
                    await Promise.all(keys.map(key => caches.delete(key)));
                    console.log("Caches deleted successfully.");
                    showToast("Caches cleared.", "success", 2000);
                } else {
                    console.log("No caches found to delete.");
                }
            } catch (error) {
                console.error('Error clearing caches:', error);
                showToast("Error clearing caches.", "error", 5000);
            }
        } else {
            console.log("Cache API not supported.");
        }
    })();

    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout: Cleanup took too long.')), 5000)
    );

    try {
        await Promise.race([cleanupPromise, timeoutPromise]);
        console.log("Cleanup finished within the time limit.");
    } catch (error: any) {
        console.warn(error.message);
        showToast("Cleanup is taking a while. Forcing reload.", "success", 3000);
    }

    console.log("Reloading the page with cache bust.");
    showToast("Reloading page for the latest version...", "success", 2000);

    setTimeout(() => {
        // Use cache busting query param to force reload from server
        // This effectively ignores any residual cache for the index file
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('t', Date.now().toString());
        window.location.replace(newUrl.toString());
    }, 1000);
};