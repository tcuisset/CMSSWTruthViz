# Installation Guide

Complete installation instructions for CMSSW Graph Visualization on different platforms.

## Quick Install (All Platforms)

If you already have Python 3.6+ and graphviz installed:

```bash
cd CMSSWGraph
chmod +x run.sh
./run.sh
```

That's it! Open http://localhost:8000/app/

---

## Platform-Specific Instructions

### Ubuntu / Debian

**1. Install system dependencies:**

```bash
# Update package list
sudo apt update

# Install Python 3, pip, venv, and graphviz
sudo apt install python3 python3-pip python3-venv graphviz
```

**2. Verify installation:**

```bash
python3 --version   # Should be 3.6 or higher
pip3 --version      # Should show pip version
dot -V              # Should show graphviz version
```

**3. Run the application:**

```bash
cd CMSSWGraph
chmod +x run.sh
./run.sh
```

**4. Open browser:**

Navigate to: http://localhost:8000/app/

---

### CentOS / RHEL / Fedora

**1. Install system dependencies:**

```bash
# CentOS/RHEL 7
sudo yum install python3 python3-pip graphviz

# CentOS/RHEL 8+ or Fedora
sudo dnf install python3 python3-pip graphviz
```

**2. Verify installation:**

```bash
python3 --version
pip3 --version
dot -V
```

**3. Run the application:**

```bash
cd CMSSWGraph
chmod +x run.sh
./run.sh
```


## Troubleshooting Installation

### graphviz Not Found

**Error:** `ImportError: failed to execute PosixPath('dot')`

**Solution:**

```bash
# Ubuntu/Debian
sudo apt install graphviz

# CentOS/RHEL
sudo yum install graphviz

# macOS
brew install graphviz

# Verify installation
dot -V
```



### Permission Denied on run.sh

**Error:** `bash: ./run.sh: Permission denied`

**Solution:**

```bash
chmod +x run.sh
```

---

## Verifying Installation

After running `./run.sh`, you should see:

```
============================================================
CMSSW Module Dependency Graph Visualization
============================================================

Serving from: /path/to/CMSSWGraph
Server address: http://localhost:8000
Application URL: http://localhost:8000/app/

Press Ctrl+C to stop the server
============================================================
```

**Test the application:**

1. Open browser to http://localhost:8000/app/
2. You should see the graph visualization
3. Click any node to verify the side panel opens
4. Try searching for a module
5. Test keyboard navigation (arrow keys)

If all these work, installation is successful! ✅

---

## Uninstallation

To remove the application:

```bash
# Stop the server (Ctrl+C)

# Remove virtual environment
rm -rf venv/

# Remove generated bundle (optional)
rm -f data/bundle.json

# The application files remain for future use
# To completely remove:
cd ..
rm -rf CMSSWGraph/
```

---

## Updating

To update the application:

```bash
# Pull latest changes (if using git)
git pull

# Remove old virtual environment
rm -rf venv/

# Regenerate bundle (if input files changed)
rm -f data/bundle.json

# Run again
./run.sh
```

---

## System Requirements
**Recommended:**
- Browser: Latest version of Chrome or Firefox

**Network:**
- No internet required (runs locally)
- Uses localhost (127.0.0.1) only

---


## Getting Help

If you encounter issues not covered here:

1. Check the [Troubleshooting](#troubleshooting-installation) section above
2. Check the main [README.md](README.md) Troubleshooting section
3. Verify all prerequisites are installed correctly
4. Check browser console for JavaScript errors
5. Check terminal for Python errors

**Common issues:**
- Missing graphviz: Install system package
- Python too old: Upgrade to 3.6+
- Port in use: Change port in server.py
- Bundle generation fails: Check input file paths

---

**For usage instructions, see [README.md](README.md)**

**For feature details, see [FEATURES.md](FEATURES.md)**
