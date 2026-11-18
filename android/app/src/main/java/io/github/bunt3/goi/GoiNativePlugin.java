package io.github.bunt3.goi;

import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Device features the WebView lacks. Called from src/native.ts.
 *
 * saveDownload: Android's WebView ignores <a download>, so backups and
 * exports are written here instead. Android 10 and later: straight into
 * Downloads through MediaStore (no permission needed). Older versions: the
 * system "save as" screen, so the user picks the place.
 *
 * Speech (ttsVoices, speak, stopSpeaking, openTtsSettings): the WebView has
 * no speechSynthesis; see Speech.java. Offline Japanese voices only.
 *
 * Incoming text (takeShare, "share" event): text chosen with Android's
 * text-selection menu ("Goi", ACTION_PROCESS_TEXT) or sent from the share
 * sheet (ACTION_SEND, text/plain). Held until the page takes it, so it isn't
 * lost while the page is still loading.
 *
 * Backup folder (pickBackupFolder, backupFolderInfo, forgetBackupFolder,
 * folderList/Read/Write/Delete): automatic backups into a folder the owner
 * picks once; see BackupFolder.java. src/native.ts wraps these as a folder
 * handle so src/backupfs.ts works unchanged.
 */
@CapacitorPlugin(name = "GoiNative")
public class GoiNativePlugin extends Plugin {

    private Speech speech;
    private BackupFolder folder;
    private JSObject pendingShare;

    @Override
    public void load() {
        speech = new Speech(getContext());
        folder = new BackupFolder(getContext());
        if (readShare(getActivity().getIntent())) {
            // Consumed: don't hand the same text over again if the page reloads.
            getActivity().setIntent(new Intent(Intent.ACTION_MAIN));
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        // Retained until a listener exists, in case the page is between loads.
        if (readShare(intent)) notifyListeners("share", new JSObject(), true);
    }

    @Override
    protected void handleOnDestroy() {
        if (speech != null) speech.shutdown();
        super.handleOnDestroy();
    }

    // ---- Incoming text

    private synchronized boolean readShare(Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        CharSequence text;
        String subject = null;
        if (Intent.ACTION_PROCESS_TEXT.equals(action)) {
            text = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT);
        } else if (Intent.ACTION_SEND.equals(action) && intent.getType() != null && intent.getType().startsWith("text/")) {
            text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        } else {
            return false;
        }
        JSObject share = new JSObject();
        share.put("text", text == null ? "" : text.toString());
        share.put("subject", subject == null ? "" : subject);
        share.put("app", sourceApp(intent));
        pendingShare = share;
        return true;
    }

    /** The name of the app the text came from ("Chrome", "LINE"), for the card's Source. */
    private String sourceApp(Intent intent) {
        String pkg = null;
        Uri ref = getActivity().getReferrer();
        if (ref != null && "android-app".equals(ref.getScheme())) pkg = ref.getHost();
        if (pkg == null) pkg = getActivity().getCallingPackage();
        if (pkg == null || pkg.equals(getContext().getPackageName())) return "";
        try {
            PackageManager pm = getContext().getPackageManager();
            return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (Exception e) {
            return ""; // not visible to us, or uninstalled since
        }
    }

    @PluginMethod
    public synchronized void takeShare(PluginCall call) {
        JSObject ret = new JSObject();
        if (pendingShare != null) ret.put("share", pendingShare);
        pendingShare = null;
        call.resolve(ret);
    }

    // ---- Speech

    @PluginMethod
    public void ttsVoices(PluginCall call) {
        speech.withEngine(call.getBoolean("refresh", false), new Speech.Ready() {
            @Override
            public void run(TextToSpeech tts) {
                List<Voice> voices = Speech.offlineJapanese(tts);
                JSArray list = new JSArray();
                for (int i = 0; i < voices.size(); i++) {
                    JSObject v = new JSObject();
                    v.put("id", voices.get(i).getName());
                    v.put("label", "日本語 " + (i + 1));
                    list.put(v);
                }
                JSObject ret = new JSObject();
                ret.put("voices", list);
                ret.put("engine", tts.getDefaultEngine());
                call.resolve(ret);
            }

            @Override
            public void fail(String message, String code) {
                // No engine is a state to explain, not an error.
                JSObject ret = new JSObject();
                ret.put("voices", new JSArray());
                ret.put("problem", message);
                call.resolve(ret);
            }
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        float rate = call.getFloat("rate", 1f);
        String voice = call.getString("voice", "");
        speech.withEngine(false, new Speech.Ready() {
            @Override
            public void run(TextToSpeech tts) {
                speech.speak(tts, text, rate, voice, new Speech.Done() {
                    @Override
                    public void ok() {
                        call.resolve();
                    }

                    @Override
                    public void fail(String message, String code) {
                        call.reject(message, code);
                    }
                });
            }

            @Override
            public void fail(String message, String code) {
                call.reject(message, code);
            }
        });
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        speech.stop();
        call.resolve();
    }

    /** Opens the phone's text-to-speech settings, where Japanese voice data is installed. */
    @PluginMethod
    public void openTtsSettings(PluginCall call) {
        Intent[] tries = {
            new Intent("com.android.settings.TTS_SETTINGS"),
            new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA),
            new Intent(Settings.ACTION_SETTINGS),
        };
        for (Intent intent : tries) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
                return;
            } catch (ActivityNotFoundException ignored) {}
        }
        call.reject("The phone has no settings screen for this.");
    }

    // ---- Links

    /** Opens a GitHub page (a release, the APK download) in the phone's browser. Nothing else. */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://github.com/")) {
            call.reject("Only GitHub links are opened.");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No browser is installed.");
        }
    }

    // ---- Backup folder

    @PluginMethod
    public void pickBackupFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        startActivityForResult(call, intent, "folderPicked");
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        JSObject ret = new JSObject();
        if (data == null || data.getData() == null) {
            ret.put("picked", false);
            call.resolve(ret);
            return;
        }
        try {
            folder.remember(data.getData());
            ret.put("picked", true);
            ret.put("name", folder.name());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Android didn't allow keeping access to that folder (" + e.getMessage() + ")");
        }
    }

    @PluginMethod
    public void backupFolderInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("chosen", folder.tree() != null);
        ret.put("granted", folder.granted());
        ret.put("name", folder.name());
        call.resolve(ret);
    }

    @PluginMethod
    public void forgetBackupFolder(PluginCall call) {
        folder.forget();
        call.resolve();
    }

    @PluginMethod
    public void folderList(PluginCall call) {
        try {
            JSArray files = new JSArray();
            for (BackupFolder.Entry e : folder.list()) {
                JSObject f = new JSObject();
                f.put("name", e.name);
                f.put("size", e.size);
                f.put("modified", e.modified);
                files.put(f);
            }
            JSObject ret = new JSObject();
            ret.put("files", files);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(message(e));
        }
    }

    @PluginMethod
    public void folderRead(PluginCall call) {
        try {
            JSObject ret = new JSObject();
            ret.put("text", folder.read(call.getString("name", "")));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(message(e));
        }
    }

    @PluginMethod
    public void folderWrite(PluginCall call) {
        try {
            folder.write(call.getString("name", ""), call.getString("text", ""));
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e));
        }
    }

    @PluginMethod
    public void folderDelete(PluginCall call) {
        try {
            folder.delete(call.getString("name", ""));
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e));
        }
    }

    private static String message(Exception e) {
        return e.getMessage() != null ? e.getMessage() : e.toString();
    }

    // ---- Files

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
