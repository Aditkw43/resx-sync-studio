# Resx Sync Studio

> Controlled and deterministic synchronization engine for .NET `.resx` resource files.

Resx Sync Studio is a client-side web application designed to help .NET developers analyze, preview, and synchronize RESX files safely and transparently.

Instead of blindly merging resource files, this tool provides full visibility and granular control over every detected change.

All processing happens locally in your browser.

---

## ✨ Purpose

Managing `.resx` files in multi-language .NET projects can quickly become error-prone:

- Missing keys between languages
- Empty translations left unnoticed
- Diverging values across environments
- Risky overwrites during refactoring

Resx Sync Studio solves this by introducing a deterministic synchronization workflow with explicit preview and approval.

---

## 🚀 Features

### 1. Multi File Pair Support
Add and manage multiple Source–Target RESX pairs simultaneously.

### 2. Configurable Synchronization Modes

You can enable one or combine multiple modes:

- **Fill Empty Values**  
  Updates only empty target values if the source contains content.

- **Add Missing Keys**  
  Inserts keys that exist in the source but not in the target.

- **Update Different Values**  
  Synchronizes values that differ between source and target.

Each mode can be toggled independently.

---

### 3. Granular Change Preview

Before applying changes, you can:

- Inspect each key
- Compare source vs target values
- Apply or skip individual changes
- Use Apply All / Skip All controls

No blind merges.

---

### 4. Batch Pairing

Upload multiple `.resx` files and assign them automatically as:

- Source (Master)
- Target (To Sync)

Files are matched using base filename logic.

---

### 5. Export Options

After synchronization:

- Download updated files as ZIP
- Generate Excel report for audit purposes

---

## 🛠 How It Works

1. Upload Source (master) and Target (to sync) `.resx` files
2. Select one or more synchronization modes
3. Click **Analyze**
4. Review detected changes
5. Apply selectively
6. Export synchronized files

---

## 🧠 Architecture Overview

Resx Sync Studio is built using:

- Vanilla JavaScript
- Tailwind CSS
- JSZip (ZIP export)
- SheetJS (Excel export)

### Core Components

- **RESXParser**  
  Parses XML and builds a resource map for deterministic lookup.

- **SyncEngine**  
  Performs change detection based on selected modes.

- **Centralized App State**  
  Maintains file pairs, changes, and sync modes.

- **Preview Renderer**  
  Groups and displays changes before application.

The synchronization logic is deterministic and map-based, ensuring consistent behavior across runs.

---

## 🔒 Security & Privacy

All file processing happens locally in your browser.

- No uploads
- No server communication
- No external storage

Safe for enterprise and proprietary projects.

---

## 💻 Installation

No installation required.

### Option 1 — Run Locally

```bash
git clone https://github.com/your-username/resx-sync-studio.git
cd resx-sync-studio
open index.html
```

### Option 2 — Deploy as Static Site

You can deploy using:

- GitHub Pages
- Netlify
- Vercel
- Any static hosting provider

---

## 📦 Use Cases

- Enterprise .NET applications
- Multi-language projects
- Localization quality checks
- Safe resource alignment before release
- Controlled updates during refactor

---

## 🗺 Roadmap

Potential improvements:

- Character-level diff visualization
- CLI version for CI/CD integration
- JSON / PO file support
- Synchronization profiles
- Performance optimization for very large resource sets
- Change history tracking

---

## 🤝 Contributing

Contributions are welcome.

If you’d like to improve the engine or UI:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

Please keep changes deterministic and mode-driven.

---

## 📄 License

MIT License

---

## 👨‍💻 Author

Developed by Kahfi  
Focused on building deterministic and scalable tooling for .NET ecosystems.

GitHub: https://github.com/aditkw43