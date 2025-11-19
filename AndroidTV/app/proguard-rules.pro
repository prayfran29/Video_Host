# Keep WebView JavaScript interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep WebAppInterface
-keep class com.magnus.videostreams.MainActivity$WebAppInterface {
    public *;
}

# Keep WebView classes
-keep class android.webkit.** { *; }
-dontwarn android.webkit.**

# Keep video streaming related classes
-keep class * implements android.media.** { *; }
-dontwarn android.media.**