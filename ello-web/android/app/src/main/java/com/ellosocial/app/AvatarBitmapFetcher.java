package com.ellosocial.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.text.TextUtils;
import android.util.LruCache;

import androidx.annotation.Nullable;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public final class AvatarBitmapFetcher {
    private static final int CONNECT_TIMEOUT_MS = 3000;
    private static final int READ_TIMEOUT_MS = 4000;
    private static final int CACHE_SIZE = 24;
    private static final LruCache<String, Bitmap> CACHE = new LruCache<>(CACHE_SIZE);

    private AvatarBitmapFetcher() {
    }

    @Nullable
    public static Bitmap load(@Nullable String rawUrl, int maxSizePx) {
        if (TextUtils.isEmpty(rawUrl)) return null;
        String url = rawUrl.trim();
        if (TextUtils.isEmpty(url)) return null;

        Bitmap cached = CACHE.get(url);
        if (cached != null && !cached.isRecycled()) {
            return cached;
        }

        Bitmap bitmap = fetch(url);
        if (bitmap == null) return null;
        Bitmap scaled = scaleDown(bitmap, Math.max(48, maxSizePx));
        CACHE.put(url, scaled);
        return scaled;
    }

    @Nullable
    private static Bitmap fetch(@Nullable String rawUrl) {
        if (TextUtils.isEmpty(rawUrl)) return null;

        String safeUrl = rawUrl.trim();
        if (TextUtils.isEmpty(safeUrl)) return null;

        Uri uri = Uri.parse(safeUrl);
        String scheme = uri.getScheme();
        if (scheme == null || (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme))) {
            return null;
        }

        HttpURLConnection connection = null;
        InputStream stream = null;
        try {
            URL url = new URL(safeUrl);
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setInstanceFollowRedirects(true);
            connection.setDoInput(true);
            connection.connect();

            if (connection.getResponseCode() >= 400) {
                return null;
            }

            stream = connection.getInputStream();
            return BitmapFactory.decodeStream(stream);
        } catch (Exception ignored) {
            return null;
        } finally {
            try {
                if (stream != null) {
                    stream.close();
                }
            } catch (Exception ignored) {
                // Ignore stream close failures.
            }
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    @Nullable
    private static Bitmap scaleDown(@Nullable Bitmap bitmap, int maxSizePx) {
        if (bitmap == null) return null;
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        if (width <= 0 || height <= 0) return bitmap;
        if (width <= maxSizePx && height <= maxSizePx) return bitmap;

        float ratio = Math.min((float) maxSizePx / width, (float) maxSizePx / height);
        int nextWidth = Math.max(1, Math.round(width * ratio));
        int nextHeight = Math.max(1, Math.round(height * ratio));

        Bitmap scaled = Bitmap.createScaledBitmap(bitmap, nextWidth, nextHeight, true);
        if (scaled != bitmap) {
            bitmap.recycle();
        }
        return scaled;
    }
}
