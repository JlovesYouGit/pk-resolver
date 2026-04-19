# START HERE - Minimal Guide

## This Tool Does 3 Things:

1. **Detects** packages from npm, pip, cargo, go
2. **Fixes** version conflicts automatically
3. **Installs** in safe virtual environments

## Quick Start (Pick ONE)

```bash
# Option A: Simple fix
node index.js .

# Option B: Interactive mode (recommended)
node index.js . terminal

# Option C: Watch for changes
node index.js . watch
```

## What Gets Fixed

| Problem | This Tool Does |
|---------|----------------|
| `npm install` fails | Finds compatible versions |
| `pip install` fails | Creates venv + installs |
| Version conflicts | Resolves with GF X H G F algorithm |
| Missing packages | Searches for alternatives |
| Mixed Node + Python | Treats as unified environment |

## Key Files (You Need 3)

```
index.js              ← Main entry (run this)
library parser logic/
  └── resolver.js     ← Algorithm (the brain)
README.md             ← Fix guide
```

## How It Works

```
Your Project
    ↓
index.js detects packages
    ↓
resolver.js finds compatible versions
    ↓
Outputs install commands
    ↓
You run them (or auto-install with Python bridge)
```

## Example Output

```bash
$ node index.js .

Detected 5 packages
✓ Column formed successfully
  Packages resolved: 5
  No conflict: true

npm install commands:
  npm install lodash@4.17.21
  npm install axios@1.6.0

pip install commands:
  pip install requests==2.31.0
```

## When To Use What

| Situation | Command |
|-----------|---------|
| Fresh clone | `node index.js .` |
| Adding packages | `node index.js . terminal` then `w` |
| Build fails | `node index.js . adjust` |
| Python only | `python3 pipeline_bridge.py .` |
| Full stack | `node central_orchestrator.js .` |

## That's It

See `README.md` for detailed fixes or `unified_venv/how to use rule.md` for full docs.
