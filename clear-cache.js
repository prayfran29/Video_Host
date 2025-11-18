// Force cache clear on TV
if (typeof Android !== 'undefined') {
    Android.clearCacheAndReload();
} else {
    location.reload(true);
}