# Static Mode Usage

The CMSSW Graph Visualization now supports **two modes**:

## 🌐 Server Mode (with Upload)

**Use when:** You want to upload new files and regenerate the bundle

**How to run:**
```bash
./run.sh
```

Then open: http://localhost:8000/app/

**Features:**
- ✅ Full graph visualization
- ✅ All navigation features
- ✅ **Upload new files** via web interface
- ✅ Automatic bundle regeneration

---

## 📁 Static Mode (No Server)

**Use when:** You just want to view the graph without a server

**How to run:**
```bash
# Option 1: Double-click in file manager
# Just double-click: app/index.html

# Option 2: From command line
open app/index.html              # macOS
xdg-open app/index.html          # Linux
start app/index.html             # Windows
```

**Features:**
- ✅ Full graph visualization
- ✅ All navigation features
- ✅ No server required
- ✅ Works offline
- ❌ Upload feature disabled (no server)

---

## How It Works

### Static Mode
- `bundle.js` contains all graph data embedded in JavaScript
- No network requests needed
- Opens directly with `file://` protocol
- Upload button is automatically hidden

### Server Mode
- Loads `data/bundle.json` via HTTP
- Upload button allows replacing input files
- Server regenerates bundle on upload

---

## Setup for Static Mode

### First Time Setup

1. **Generate the static bundle:**
   ```bash
   # Generate bundle.json and bundle.js
   python preprocess/build_bundle.py
   ```

2. **Open in browser:**
   ```bash
   # Just open the file
   open app/index.html
   ```

That's it! The application runs entirely in your browser.

### Updating Data

When you have new `dependency.gv` or `dumpConfig.py` files:

```bash
# Regenerate both bundle.json and bundle.js
python preprocess/build_bundle.py

# Or use the full script
./run.sh
```

The `run.sh` script automatically generates both files.

---

## File Sizes

| File | Size | Description |
|------|------|-------------|
| `data/bundle.json` | ~22 MB | Server mode data |
| `app/js/bundle.js` | ~15 MB | Static mode data (compressed) |

**Why is bundle.js smaller?**
- JSON is minified (no whitespace)
- Embedded directly in JavaScript

---

## Sharing the Visualization

### Option 1: Share Static Files

Zip these files and send:
```bash
# Create a portable package
zip -r cmssw-graph-static.zip app/
```

Recipients can:
1. Unzip the folder
2. Open `app/index.html` in their browser
3. No installation needed!

### Option 2: Host on a Web Server

Upload the `app/` folder to any static hosting:
- GitHub Pages
- Netlify
- Vercel
- Your own web server

See [HOSTING.md](HOSTING.md) for details.

---

## Browser Compatibility

### Static Mode (file://)

**Works in:**
- ✅ Chrome/Chromium (all platforms)
- ✅ Firefox (all platforms)
- ✅ Safari (macOS)
- ✅ Edge (Windows)

**May have issues:**
- ⚠️ Some browsers block JavaScript on `file://` (rare)
- ⚠️ CORS restrictions don't apply (good!)

**If it doesn't work:**
1. Check browser console (F12) for errors
2. Try a different browser
3. Use server mode instead: `./run.sh`

### Server Mode (http://)

**Works in all modern browsers** - no restrictions.

---

## Troubleshooting Static Mode

### Issue: Graph doesn't load

**Symptom:** Blank page or "Loading..." forever

**Solution:**
1. Open browser console (F12 → Console tab)
2. Check for errors
3. Verify `bundle.js` exists:
   ```bash
   ls -lh app/js/bundle.js
   ```
4. If missing, regenerate:
   ```bash
   python preprocess/generate_bundle_js.py
   ```

### Issue: Bundle.js is outdated

**Symptom:** Graph shows old data after updating input files

**Solution:**
```bash
# Regenerate both files
rm -f data/bundle.json app/js/bundle.js
python preprocess/build_bundle.py
```

### Issue: File is too large

**Symptom:** Browser slow or crashes

**Solution:**
- `bundle.js` is ~15 MB - should work fine
- If you have a much larger graph (>10,000 nodes):
  1. Use server mode instead
  2. Or filter your input data

---

## When to Use Each Mode

| Scenario | Recommended Mode |
|----------|------------------|
| Quick visualization | **Static** - just open the file |
| Sharing with colleagues | **Static** - send them the app/ folder |
| Regular data updates | **Server** - use upload feature |
| Presentation/demo | **Static** - no setup needed |
| Development/testing | **Server** - easier debugging |
| Hosting online | Either works |

---

## Advantages of Static Mode

✅ **No installation required** (besides initial preprocessing)
✅ **Portable** - works anywhere
✅ **Offline** - no internet needed
✅ **Fast** - no server startup time
✅ **Simple** - just open a file
✅ **Shareable** - zip and send

## Advantages of Server Mode

✅ **Upload new data** - via web interface
✅ **Auto-regenerate** - bundle created automatically
✅ **Easier debugging** - better error messages
✅ **No file size limits** - browser handles large files better

---

## Advanced: Manual Mode Selection

The application auto-detects the mode, but you can force it:

**Force Static Mode:**
```javascript
// Add to app/js/main.js before initApp()
window.FORCE_STATIC_MODE = true;
```

**Force Server Mode:**
```javascript
// Remove bundle.js from index.html
// Comment out: <script src="js/bundle.js"></script>
```

---

**For full documentation, see [README.md](README.md)**

**For installation help, see [INSTALL.md](INSTALL.md)**
