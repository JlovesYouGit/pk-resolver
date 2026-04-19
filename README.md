# Package Resolver - Fix Repository Issues

A universal cross-language dependency resolver that automatically detects and fixes package-related issues in multi-language repositories.

## Common Repository Issues This Tool Fixes

### 1. "Dependency Not Found" / "Module Not Found" Errors

**Problem:** Package was removed from registry or renamed.

**Fix:**
```bash
node index.js . adjust
```

The tool will search for available versions and suggest alternatives:
```
[VersionProtocol] old-package-name: ^1.0.0 → new-package-name 2.1.0 (adjusted)
```

### 2. Version Conflicts Between Dependencies

**Problem:** Package A requires lodash ^4.17.0, Package B requires lodash ^3.10.0

**Fix:**
```bash
node index.js .
```

The GF X H G F algorithm finds compatible versions:
```
✓ Column formed successfully
  Packages resolved: 15
  No conflict: true
  GF value: 0.8534
```

### 3. "Cannot resolve dependency" After Node/Python/Rust Update

**Problem:** Language version updated, old packages incompatible.

**Fix:**
```bash
# Python packages
python3 pipeline_bridge.py . 

# Node packages
node central_orchestrator.js .
```

Auto-creates virtual environments and finds compatible versions.

### 4. Mixed Language Project Dependency Hell

**Problem:** Backend (Python) and Frontend (Node.js) have conflicting transitive dependencies.

**Fix:**
```bash
# From project root
node index.js . terminal

# In terminal mode:
> r  # Resolve all packages
> c  # Check for corrections
```

The unified environment treats all packages as one ecosystem.

### 5. "npm install" or "pip install" Fails Repeatedly

**Problem:** Installation fails due to version mismatches.

**Fix:**
```bash
# Enable predictive monitoring
node predictive_pid_layer.js . 

# Let it run during installation - it will:
# - Detect version_mismatch errors in real-time
# - Suggest corrected versions
# - Output: "resolve_version_conflicts:lodash,axios"
```

### 6. Lockfile Out of Sync

**Problem:** package-lock.json or requirements.txt doesn't match actual installed versions.

**Fix:**
```bash
node index.js . 

# Parses installed packages and suggests lockfile updates:
# [Resolver] Detected 5 version mismatches
# Install commands:
#   npm install lodash@4.17.21
#   pip install requests==2.31.0
```

### 7. Security Vulnerabilities in Dependencies

**Problem:** npm audit or pip-audit shows vulnerable packages.

**Fix:**
```bash
# The targeting system prioritizes security updates
python3 pipeline_bridge.py . 

# Rules applied:
# [security-critical] priority=100 - updates auth/crypto packages first
```

## Quick Fix Commands

| Issue | Command |
|-------|---------|
| Version conflicts | `node index.js . adjust` |
| Missing packages | `node index.js .` |
| Install failures | `node predictive_pid_layer.js .` |
| Mixed language deps | `node central_orchestrator.js .` |
| Python venv issues | `python3 pipeline_bridge.py .` |
| Auto-watch for changes | `node index.js . watch` |

## How It Works

1. **Auto-Detect** - Finds package.json, requirements.txt, Cargo.toml, go.mod
2. **GF X H G F Algorithm** - Calculates compatibility scores (GF=Gap Factor, H=Harmony)
3. **Version Adjustment** - Searches registries for best matching versions
4. **Unified Resolution** - Ensures all languages work together
5. **Safe Installation** - Auto-creates venvs, installs corrected versions

## Installation

```bash
git clone https://github.com/JlovesYouGit/pk-resolver.git
cd pk-resolver
```

## Usage Examples

### Fix a Broken Node.js Project

```bash
cd my-broken-node-project
node index.js .

# Output shows:
# Detected 12 packages
# [VersionProtocol] 3 packages adjusted for compatibility
# npm install commands generated
```

### Fix Python Requirements Conflicts

```bash
cd my-python-project
python3 pipeline_bridge.py .

# Output:
# [CONSTRAINT] Auto-creating venv
# Adjusted 2 packages
# pip install commands generated
```

### Fix Full-Stack (Node + Python)

```bash
cd my-fullstack-app
node central_orchestrator.js .

# Unified resolution across backend/frontend
# Reports cross-language compatibility
```

## Files Generated

After running, check these files for resolution details:

- `.package_resolver_columns.json` - Resolved compatibility data
- `.pid_predictions.json` - Package error predictions
- `.unified_manifest.json` - Cross-language dependency map

## Troubleshooting

### "No compatible resolution"

```bash
# Increase resolution rounds
node index.js . adjust

# Or manually specify a version
# Edit package.json/requirements.txt with working version
```

### "Python packages not installing"

```bash
# Verify venv was created
ls safely_contained_venv/bin/pip

# If missing, run:
python3 -m venv safely_contained_venv
python3 pipeline_bridge.py .
```

### "Still getting errors after fix"

```bash
# Clear resolution cache
rm .package_resolver_columns.json
node index.js .

# Or run in watch mode to catch new issues
node index.js . watch
```

## CI/CD Integration

Add to your GitHub Actions workflow:

```yaml
- name: Fix Dependencies
  run: |
    git clone https://github.com/JlovesYouGit/pk-resolver.git
    node pk-resolver/index.js . adjust
```

## What Makes This Different

- **Cross-Language**: Fixes Node + Python + Rust + Go in one run
- **Proactive**: Predicts issues before they break builds
- **Automatic**: No manual version hunting
- **Safe**: Creates isolated environments

## Need Help?

Check the full guide: `unified_venv/how to use rule.md`

## License

MIT - See LICENSE file
