package com.majin.videostreams;

import android.webkit.JavascriptInterface;

public class WebAppInterface {
    
    @JavascriptInterface
    public void showToast(String toast) {
        // Handle JavaScript calls from WebView
    }
}