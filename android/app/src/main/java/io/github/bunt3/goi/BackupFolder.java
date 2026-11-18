package io.github.bunt3.goi;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.DocumentsContract.Document;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * The backup folder the owner picked with Android's folder picker (Storage
 * Access Framework). The permission is kept across restarts; only files
 * directly inside the folder are touched, and only by name.
 */
class BackupFolder {

    static final class Entry {
        final Uri uri;
        final String name;
        final long size;
        final long modified;

        Entry(Uri uri, String name, long size, long modified) {
            this.uri = uri;
            this.name = name;
            this.size = size;
            this.modified = modified;
        }
    }

    private static final String PREFS = "goi";
    private static final String KEY = "backupTree";
    private static final int FLAGS = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;

    private final Context context;

    BackupFolder(Context context) {
        this.context = context.getApplicationContext();
    }

    private SharedPreferences prefs() {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    Uri tree() {
        String s = prefs().getString(KEY, null);
        return s == null ? null : Uri.parse(s);
    }

    /** Keep the permission for a newly picked folder and let go of the old one. */
    void remember(Uri tree) {
        ContentResolver cr = context.getContentResolver();
        cr.takePersistableUriPermission(tree, FLAGS);
        Uri old = tree();
        if (old != null && !old.equals(tree)) release(old);
        prefs().edit().putString(KEY, tree.toString()).apply();
    }

    void forget() {
        Uri old = tree();
        if (old != null) release(old);
        prefs().edit().remove(KEY).apply();
    }

    private void release(Uri uri) {
        try {
            context.getContentResolver().releasePersistableUriPermission(uri, FLAGS);
        } catch (SecurityException ignored) {
            // already gone
        }
    }

    /** Still allowed to write? False after the folder was deleted or access was revoked. */
    boolean granted() {
        Uri tree = tree();
        if (tree == null) return false;
        for (UriPermission p : context.getContentResolver().getPersistedUriPermissions()) {
            if (p.getUri().equals(tree) && p.isWritePermission() && p.isReadPermission()) return true;
        }
        return false;
    }

    /** The folder's display name, or "" if it can't be read. */
    String name() {
        Uri tree = tree();
        if (tree == null) return "";
        Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        try (Cursor c = context.getContentResolver().query(doc, new String[] { Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {}
        return "";
    }

    /** Files directly in the folder (not subfolders). */
    List<Entry> list() throws FileNotFoundException {
        Uri tree = requireTree();
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        String[] cols = {
            Document.COLUMN_DOCUMENT_ID,
            Document.COLUMN_DISPLAY_NAME,
            Document.COLUMN_SIZE,
            Document.COLUMN_LAST_MODIFIED,
            Document.COLUMN_MIME_TYPE,
        };
        List<Entry> out = new ArrayList<>();
        try (Cursor c = context.getContentResolver().query(children, cols, null, null, null)) {
            if (c == null) throw new FileNotFoundException("the folder can't be read");
            while (c.moveToNext()) {
                if (Document.MIME_TYPE_DIR.equals(c.getString(4))) continue;
                Uri uri = DocumentsContract.buildDocumentUriUsingTree(tree, c.getString(0));
                out.add(new Entry(uri, c.getString(1), c.isNull(2) ? -1 : c.getLong(2), c.isNull(3) ? 0 : c.getLong(3)));
            }
        }
        return out;
    }

    Entry find(String name) throws FileNotFoundException {
        for (Entry e : list()) if (e.name.equals(name)) return e;
        return null;
    }

    String read(String name) throws Exception {
        Entry e = find(name);
        if (e == null) throw new FileNotFoundException(name + " is not in the folder");
        try (InputStream in = context.getContentResolver().openInputStream(e.uri)) {
            if (in == null) throw new FileNotFoundException("could not open " + name);
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[64 * 1024];
            int n;
            while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
            return buf.toString(StandardCharsets.UTF_8.name());
        }
    }

    /**
     * Create or replace `name`. The caller (backupfs.ts) checks the size
     * afterwards, in case a provider accepts "wt" without truncating.
     */
    void write(String name, String text) throws Exception {
        ContentResolver cr = context.getContentResolver();
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        Entry e = find(name);
        OutputStream out = null;
        Uri uri = null;
        if (e != null) {
            try {
                out = cr.openOutputStream(e.uri, "wt"); // replace the contents
                uri = e.uri;
            } catch (IllegalArgumentException | UnsupportedOperationException | SecurityException | FileNotFoundException refused) {
                // This folder can't replace a file's contents. Plain "w" might
                // leave the old file's tail behind, so start a new file instead.
                DocumentsContract.deleteDocument(cr, e.uri);
            }
        }
        if (out == null) {
            Uri tree = requireTree();
            Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            uri = DocumentsContract.createDocument(cr, parent, "application/json", name);
            if (uri == null) throw new FileNotFoundException("the folder refused a new file");
            out = cr.openOutputStream(uri, "w");
        }
        if (out == null) throw new FileNotFoundException("could not open " + name + " for writing");
        try (OutputStream o = out) {
            o.write(bytes);
            o.flush();
        }
    }

    void delete(String name) throws Exception {
        Entry e = find(name);
        if (e != null) DocumentsContract.deleteDocument(context.getContentResolver(), e.uri);
    }

    private Uri requireTree() throws FileNotFoundException {
        Uri tree = tree();
        if (tree == null) throw new FileNotFoundException("no backup folder chosen");
        return tree;
    }
}
