package io.github.bunt3.goi;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Device features the WebView lacks. Called from src/native.ts.
 *
 * saveDownload: Android's WebView ignores <a download>, so backups and
 * exports are written here instead. Android 10 and later: straight into
 * Downloads through MediaStore (no permission needed). Older versions: the
 * system "save as" screen, so the user picks the place.
 */
@CapacitorPlugin(name = "GoiNative")
public class GoiNativePlugin extends Plugin {

    @PluginMethod
    public void saveDownload(PluginCall call) {
        String name = call.getString("name");
        String mime = call.getString("mime", "application/octet-stream");
        String text = call.getString("text");
        if (name == null || text == null) {
            call.reject("name and text are required");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri uri = null;
            try {
                uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("Downloads refused the file");
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) throw new IllegalStateException("could not open the file");
                    out.write(text.getBytes(StandardCharsets.UTF_8));
                }
                ContentValues done = new ContentValues();
                done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                resolver.update(uri, done, null, null);
                JSObject ret = new JSObject();
                ret.put("where", "Downloads");
                call.resolve(ret);
            } catch (Exception e) {
                if (uri != null) {
                    try {
                        resolver.delete(uri, null, null);
                    } catch (Exception ignored) {}
                }
                call.reject(e.getMessage() != null ? e.getMessage() : e.toString(), e);
            }
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "savePicked");
    }

    @ActivityCallback
    private void savePicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (data == null || data.getData() == null) {
            call.reject("Saving was cancelled");
            return;
        }
        try (OutputStream out = getContext().getContentResolver().openOutputStream(data.getData())) {
            if (out == null) throw new IllegalStateException("could not open the file");
            out.write(call.getString("text", "").getBytes(StandardCharsets.UTF_8));
            JSObject ret = new JSObject();
            ret.put("where", "the chosen file");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : e.toString(), e);
        }
    }
}
