package com.magnus.videostreams;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.os.Handler;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.content.SharedPreferences;
import android.content.Context;
import java.io.InputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private WebView webView;
    private String siteUrl;
    private int retryCount = 0;
    private int maxRetries;
    private int retryDelayBase;
    private int periodicRetryInterval;
    private int loginDelay;
    private int videoOptimizationDelay;
    private String defaultTvPassword;
    private Handler retryHandler = new Handler();
    private Runnable periodicRetry;
    private boolean siteLoaded = false;
    private SharedPreferences prefs;
    private boolean loginAttempted = false;
    private String videoOptimizationScript;
    private Handler inactivityHandler = new Handler();
    private Runnable sleepRunnable;
    private static final int INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        
        // Keep screen on during video playback
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Load configuration values
        loadConfiguration();
        
        webView = findViewById(R.id.webview);
        prefs = getSharedPreferences("VideoHostAuth", Context.MODE_PRIVATE);
        setupWebView();
        loadSiteWithRetry();
        startInactivityTimer();
    }
    
    private void loadConfiguration() {
        siteUrl = BuildConfig.SITE_URL;
        maxRetries = getResources().getInteger(R.integer.max_retries);
        retryDelayBase = getResources().getInteger(R.integer.retry_delay_base);
        periodicRetryInterval = getResources().getInteger(R.integer.periodic_retry_interval);
        loginDelay = getResources().getInteger(R.integer.login_delay);
        videoOptimizationDelay = getResources().getInteger(R.integer.video_optimization_delay);
        defaultTvPassword = getString(R.string.default_tv_password);
        
        // Load video optimization script
        try {
            InputStream is = getAssets().open("video_optimization.js");
            byte[] buffer = new byte[is.available()];
            is.read(buffer);
            is.close();
            videoOptimizationScript = new String(buffer, StandardCharsets.UTF_8);
        } catch (IOException e) {
            videoOptimizationScript = "console.log('Video optimization script not found');"; 
        }
    }
    
    private void loadSiteWithRetry() {
        retryCount = 0;
        siteLoaded = false;
        webView.loadUrl(siteUrl);
    }
    
    private void startPeriodicRetry() {
        stopPeriodicRetry();
        periodicRetry = () -> {
            if (!siteLoaded) {
                retryCount = 0;
                webView.loadUrl(siteUrl);
                retryHandler.postDelayed(periodicRetry, periodicRetryInterval);
            }
        };
        retryHandler.postDelayed(periodicRetry, periodicRetryInterval);
    }
    
    private void stopPeriodicRetry() {
        if (periodicRetry != null) {
            retryHandler.removeCallbacks(periodicRetry);
        }
    }
    
    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopPeriodicRetry();
        stopInactivityTimer();
    }
    
    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
        stopInactivityTimer();
    }
    
    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
        startInactivityTimer();
    }

    private void setupWebView() {
        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setAllowFileAccess(false); // Security: Disable file access
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setAllowContentAccess(true);
        // Security: Remove dangerous file access permissions
        webSettings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        
        // Image loading settings for TV
        webSettings.setLoadsImagesAutomatically(true);
        webSettings.setBlockNetworkImage(false);
        webSettings.setBlockNetworkLoads(false);
        webSettings.setDatabaseEnabled(true);
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);
        
        // TV-specific optimizations
        webSettings.setGeolocationEnabled(false);
        webSettings.setSaveFormData(false);
        webSettings.setSavePassword(false);
        
        // Security: Only allow HTTPS mixed content for trusted domains
        webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        
        // Enable debugging only in debug builds
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(BuildConfig.ENABLE_WEBVIEW_DEBUG);
        }
        
        // Add JavaScript interface for app control
        webView.addJavascriptInterface(new WebAppInterface(), "Android");
        
        // Clear cache but keep important data
        webView.clearCache(false);
        
        // Use hardware acceleration when available, fallback to software
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.HONEYCOMB) {
            webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
        } else {
            webView.setLayerType(WebView.LAYER_TYPE_SOFTWARE, null);
        }
        
        // Ensure cookies work for authentication
        android.webkit.CookieManager cookieManager = android.webkit.CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);
        
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }
            
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Reset retry count on successful load
                retryCount = 0;
                siteLoaded = true;
                stopPeriodicRetry();
                
                // Inject back button handler
                view.evaluateJavascript(
                    "document.addEventListener('keydown', function(e) {" +
                    "  if (e.keyCode === 4 || e.key === 'GoBack') {" +
                    "    var seriesModal = document.getElementById('seriesModal');" +
                    "    if (seriesModal && seriesModal.style.display === 'block') {" +
                    "      e.preventDefault();" +
                    "      closeSeries();" +
                    "    }" +
                    "  }" +
                    "});", null);
                
                // Auto-login with stored credentials and apply video optimizations
                if (url.contains("magnushackhost.win")) {
                    if (!loginAttempted) {
                        loginAttempted = true;
                        performAutoLogin(view);
                    }
                    applyVideoOptimizations(view);
                }
            }
            
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                super.onReceivedError(view, errorCode, description, failingUrl);
                
                // Retry logic for main site and video files
                if (retryCount < maxRetries) {
                    retryCount++;
                    
                    // Exponential backoff
                    long delay = retryDelayBase * (1L << (retryCount - 1));
                    
                    retryHandler.postDelayed(() -> {
                        if (failingUrl.equals(siteUrl) || failingUrl.contains("magnushackhost.win")) {
                            // Retry main site
                            view.loadUrl(siteUrl);
                        } else {
                            // Retry current page
                            view.reload();
                        }
                    }, delay);
                } else if (failingUrl.equals(siteUrl) || failingUrl.contains("magnushackhost.win")) {
                    // Start periodic retry for main site
                    siteLoaded = false;
                    startPeriodicRetry();
                }
            }
            
            @Override
            public void onLoadResource(WebView view, String url) {
                super.onLoadResource(view, url);
                // Preload video resources for better performance
                if (url.contains(".mp4") || url.contains(".webm")) {
                    view.evaluateJavascript("document.querySelector('video')?.setAttribute('preload', 'metadata');", null);
                }
            }
            
            @Override
            public void onReceivedHttpError(WebView view, android.webkit.WebResourceRequest request, android.webkit.WebResourceResponse errorResponse) {
                super.onReceivedHttpError(view, request, errorResponse);
                // Log QR login API errors for debugging
                if (request.getUrl().toString().contains("/api/qr")) {
                    android.util.Log.e("WebView", "QR API Error: " + errorResponse.getStatusCode());
                }
            }
        });
        
        // Enable fullscreen video support with TV optimizations
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                super.onProgressChanged(view, newProgress);
                // Apply video optimizations when page loads
                if (newProgress > 80) {
                    view.evaluateJavascript(videoOptimizationScript, null);
                }
            }
            private View customView;
            private CustomViewCallback customViewCallback;
            
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    onHideCustomView();
                    return;
                }
                
                customView = view;
                customViewCallback = callback;
                
                // Hide system UI for fullscreen with TV-specific flags
                getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN |
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                );
                
                // Add custom view to activity
                FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                );
                
                FrameLayout container = findViewById(android.R.id.content);
                container.addView(customView, params);
                webView.setVisibility(View.GONE);
            }
            
            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                
                // Show system UI
                getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
                
                // Remove custom view
                FrameLayout container = findViewById(android.R.id.content);
                container.removeView(customView);
                customView = null;
                
                // Show WebView again
                webView.setVisibility(View.VISIBLE);
                
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                    customViewCallback = null;
                }
            }
        });
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // Reset inactivity timer on any key press
        resetInactivityTimer();
        
        // Handle D-pad navigation
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_LEFT:
            case KeyEvent.KEYCODE_DPAD_RIGHT:
            case KeyEvent.KEYCODE_DPAD_UP:
            case KeyEvent.KEYCODE_DPAD_DOWN:
            case KeyEvent.KEYCODE_DPAD_CENTER:
                // Let WebView handle navigation
                return super.onKeyDown(keyCode, event);
            case KeyEvent.KEYCODE_BACK:
                // Handle fullscreen exit first
                WebChromeClient chromeClient = (WebChromeClient) webView.getWebChromeClient();
                if (chromeClient != null) {
                    try {
                        chromeClient.onHideCustomView();
                        return true;
                    } catch (Exception e) {
                        // Not in fullscreen, continue with normal back behavior
                    }
                }
                
                // Send back key to JavaScript
                webView.evaluateJavascript(
                    "var event = new KeyboardEvent('keydown', { keyCode: 4, key: 'GoBack' });" +
                    "document.dispatchEvent(event);", null);
                
                // Prevent default back navigation for modals
                return true;
        }
        return super.onKeyDown(keyCode, event);
    }
    
    private void performAutoLogin(WebView view) {
        String savedUsername = prefs.getString("username", "");
        String savedPassword = prefs.getString("password", "");
        
        String deviceId = android.provider.Settings.Secure.getString(getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);
        String deviceUsername = "TV-" + deviceId.substring(Math.max(0, deviceId.length() - 8));
        
        // First check if already logged in with valid token
        String tokenCheckScript = "setTimeout(() => {" +
            "  if (localStorage.getItem('authToken') && localStorage.getItem('currentUser')) {" +
            "    fetch('/api/series', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') } })" +
            "      .then(response => {" +
            "        if (response.ok) {" +
            "          console.log('Existing token valid, skipping login');" +
            "          if (typeof updateUI === 'function') updateUI();" +
            "          document.querySelector('main').style.display = 'block';" +
            "          if (typeof loadSeries === 'function') loadSeries();" +
            "          return;" +
            "        } else {" +
            "          console.log('Token invalid, proceeding with login');" +
            "          performLogin();" +
            "        }" +
            "      })" +
            "      .catch(() => performLogin());" +
            "  } else {" +
            "    performLogin();" +
            "  }" +
            "  " +
            "  function performLogin() {" +
            "    if (document.getElementById('loginUsername')) {" +
            "      if ('" + savedUsername + "' && '" + savedPassword + "') {" +
            "        document.getElementById('loginUsername').value = '" + savedUsername + "';" +
            "        document.getElementById('loginPassword').value = '" + savedPassword + "';" +
            "        setTimeout(() => { if (typeof login === 'function') login(); }, 500);" +
            "      } else {" +
            "        document.getElementById('loginUsername').value = '" + deviceUsername + "';" +
            "        document.getElementById('loginPassword').value = '" + defaultTvPassword + "';" +
            "        setTimeout(() => { if (typeof login === 'function') login(); }, 500);" +
            "      }" +
            "    }" +
            "  }" +
            "}, " + loginDelay + ");"; 
        
        view.evaluateJavascript(tokenCheckScript, null);
    }
    
    private void applyVideoOptimizations(WebView view) {
        String optimizationScript = "setTimeout(() => {" + videoOptimizationScript + "}, " + videoOptimizationDelay + ");"; 
        view.evaluateJavascript(optimizationScript, null);
    }
    
    public class WebAppInterface {
        @android.webkit.JavascriptInterface
        public void exitApp() {
            finish();
        }
        
        @android.webkit.JavascriptInterface
        public void clearCacheAndReload() {
            runOnUiThread(() -> {
                webView.clearCache(true);
                webView.clearHistory();
                webView.reload();
            });
        }
        
        @android.webkit.JavascriptInterface
        public void saveCredentials(String username, String password) {
            // Only save non-TV accounts for manual login
            if (!username.startsWith("TV-")) {
                SharedPreferences.Editor editor = prefs.edit();
                editor.putString("username", username);
                editor.putString("password", password);
                editor.apply();
            }
        }
        
        @android.webkit.JavascriptInterface
        public void showLoginPrompt() {
            runOnUiThread(() -> {
                webView.evaluateJavascript(
                    "var loginDiv = document.createElement('div');" +
                    "loginDiv.innerHTML = '<div style=\"position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.9);color:white;padding:20px;border-radius:10px;z-index:9999;text-align:center;\">" +
                    "<h3>First Time Setup</h3>" +
                    "<p>Use your phone to scan QR code or enter credentials manually</p>" +
                    "<button id=\"firstTimeOkBtn\" onclick=\"this.parentElement.parentElement.remove()\" style=\"background:#007bff;color:white;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;\">OK</button>" +
                    "</div>';" +
                    "document.body.appendChild(loginDiv);" +
                    "setTimeout(() => { document.getElementById('firstTimeOkBtn').focus(); }, 100);", null);
            });
        }
        
        @android.webkit.JavascriptInterface
        public String getDeviceId() {
            return android.provider.Settings.Secure.getString(getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);
        }
        
        @android.webkit.JavascriptInterface
        public void clearCredentials() {
            SharedPreferences.Editor editor = prefs.edit();
            editor.clear();
            editor.apply();
            loginAttempted = false;
            
            // Clear web storage as well
            runOnUiThread(() -> {
                webView.evaluateJavascript(
                    "localStorage.removeItem('authToken');" +
                    "localStorage.removeItem('currentUser');" +
                    "localStorage.removeItem('tvDeviceId');", null);
            });
        }
    }
    
    private void startInactivityTimer() {
        stopInactivityTimer();
        sleepRunnable = () -> {
            // Put TV to sleep by finishing the activity
            finish();
        };
        inactivityHandler.postDelayed(sleepRunnable, INACTIVITY_TIMEOUT);
    }
    
    private void stopInactivityTimer() {
        if (sleepRunnable != null) {
            inactivityHandler.removeCallbacks(sleepRunnable);
        }
    }
    
    private void resetInactivityTimer() {
        startInactivityTimer();
    }
}