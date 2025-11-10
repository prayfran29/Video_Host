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

public class MainActivity extends Activity {
    private WebView webView;
    private static final String SITE_URL = "https://magnushackhost.win";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        setupWebView();
        webView.loadUrl(SITE_URL);
    }

    private void setupWebView() {
        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setAllowContentAccess(true);
        webSettings.setAllowFileAccessFromFileURLs(true);
        webSettings.setAllowUniversalAccessFromFileURLs(true);
        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
        webSettings.setDatabaseEnabled(true);
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);
        
        // Memory optimizations for TV
        webSettings.setGeolocationEnabled(false);
        webSettings.setSaveFormData(false);
        webSettings.setSavePassword(false);
        
        // Clear cache less aggressively to preserve icons and performance
        webView.clearCache(false);
        
        // Enable hardware acceleration for video
        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
        
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }
            
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                // Retry loading on error
                if (failingUrl.contains(".avi")) {
                    // Video file error - reload page
                    view.reload();
                }
            }
        });
        
        // Enable fullscreen video support
        webView.setWebChromeClient(new WebChromeClient() {
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
                
                // Hide system UI for fullscreen
                getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN |
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
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
                
                if (webView.canGoBack()) {
                    webView.goBack();
                    return true;
                }
                break;
        }
        return super.onKeyDown(keyCode, event);
    }
}