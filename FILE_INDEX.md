# File Index - Quick Reference

## Core Files (Start Here)

| File | Size | Purpose | When to Use |
|------|------|---------|-------------|
| `index.js` | 20KB | Main resolver with terminal mode | Primary entry point |
| `README.md` | 5KB | Fix common repo issues | Quick help |
| `unified_venv/how to use rule.md` | 12KB | Full developer guide | Detailed docs |

## System Components

### Node.js Components
- **`central_orchestrator.js`** (19KB) - Node-centric process manager, spawns Python subprocess
- **`predictive_pid_layer.js`** (22KB) - Terminal log monitoring, package error detection

### Python Components
- **`pipeline_bridge.py`** (21KB) - Python bridge with targeting rules, grep-based detection
- **`python_subbridge.py`** (18KB) - Python subprocess for unified env management

### Resolution Engine
- **`library parser logic/resolver.js`** (15KB) - Core GF X H G F algorithm
- **`library parser logic/resolver_new.go`** (12KB) - Go implementation
- **`library parser logic/resolver_new`** (3.4MB) - Compiled Go binary

### Utilities
- **`venv_manager.go`** (3KB) - Go venv manager source
- **`venv_manager`** (3.4MB) - Compiled venv manager binary
- **`package.json`** (233B) - Node project config
- **`go.mod`** (29B) - Go module config

## Generated Files (Runtime)

These are created when you run the tool:

- `.package_resolver_columns.json` - Resolved package compatibility data
- `.pid_predictions.json` - Package error predictions
- `.unified_manifest.json` - Cross-language dependency map
- `.cobold_bridge.json` - Quantity tracking data
- `safely_contained_venv/` - Auto-created Python virtual environment

## Quick Commands by File

```bash
# Main resolver (index.js)
node index.js .                    # One-shot resolution
node index.js . terminal           # Interactive mode
node index.js . watch              # Watch mode

# Central orchestrator (central_orchestrator.js)
node central_orchestrator.js .     # Node-centric mode
node central_orchestrator.js . loop # Continuous monitoring

# Python bridge (pipeline_bridge.py)
python3 pipeline_bridge.py .       # Python targeting
python3 pipeline_bridge.py . loop  # Continuous targeting

# Predictive layer (predictive_pid_layer.js)
node predictive_pid_layer.js .    # Error monitoring
```

## File Relationships

```
index.js (main)
  ├── calls → library parser logic/resolver.js
  └── spawns → pipeline_bridge.py (optional)

central_orchestrator.js
  ├── spawns → python_subbridge.py
  └── uses → predictive_pid_layer.js

pipeline_bridge.py
  ├── calls → library parser logic/resolver.js
  └── manages → safely_contained_venv/
```

## Size Summary

- **Documentation**: ~17KB (README + guide)
- **JavaScript**: ~60KB (3 files)
- **Python**: ~39KB (2 files)
- **Go Source**: ~15KB (2 files)
- **Binaries**: ~6.8MB (2 compiled)
- **Total Source**: ~131KB
- **Total with Binaries**: ~7MB

## For AI/IDE Context

If you're an AI assistant or IDE working with this codebase:

1. **Start with `index.js`** - Main orchestration logic
2. **Check `README.md`** - Common fix patterns
3. **Reference `unified_venv/how to use rule.md`** - Full workflows
4. **Core algorithm**: `library parser logic/resolver.js` lines 344-425
5. **Error detection**: `predictive_pid_layer.js` lines 90-251

## Navigation Tips

- Looking for **resolution algorithm**? → `library parser logic/resolver.js`
- Looking for **terminal interaction**? → `index.js` (TerminalInterruption class)
- Looking for **package error detection**? → `predictive_pid_layer.js`
- Looking for **Python integration**? → `python_subbridge.py`
- Looking for **version adjustment**? → `resolver.js` lines 344-425
