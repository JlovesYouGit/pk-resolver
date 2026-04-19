#!/usr/bin/env node
/**
 * CONTROL CENTER - Single Entry Point
 * 
 * This is the ONLY file you need to interact with.
 * Run: node CONTROL_CENTER.js <command>
 * 
 * Available Commands:
 *   fix       - Fix all package issues in current directory
 *   interactive - Interactive terminal mode
 *   watch     - Watch for changes and auto-fix
 *   status    - Check current status
 *   help      - Show this help
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Simple colored output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m'
};

function log(msg, color = 'reset') {
    console.log(colors[color] + msg + colors.reset);
}

// Main command router
async function main() {
    const command = process.argv[2] || 'help';
    const targetDir = process.argv[3] || '.';

    log('\n=== Package Resolver Control Center ===\n', 'blue');

    switch(command) {
        case 'fix':
            await runFix(targetDir);
            break;
        case 'interactive':
        case 'i':
            await runInteractive(targetDir);
            break;
        case 'watch':
        case 'w':
            await runWatch(targetDir);
            break;
        case 'status':
        case 's':
            await showStatus(targetDir);
            break;
        case 'python':
        case 'py':
            await runPythonBridge(targetDir);
            break;
        case 'help':
        default:
            showHelp();
    }
}

// Command: Fix - Run one-shot resolution
async function runFix(dir) {
    log('🔧 Fixing packages in: ' + path.resolve(dir), 'blue');
    
    // Check what package files exist
    const hasNode = fs.existsSync(path.join(dir, 'package.json'));
    const hasPython = fs.existsSync(path.join(dir, 'requirements.txt')) || 
                      fs.existsSync(path.join(dir, 'pyproject.toml'));
    const hasRust = fs.existsSync(path.join(dir, 'Cargo.toml'));
    const hasGo = fs.existsSync(path.join(dir, 'go.mod'));
    
    log('\nDetected:');
    if (hasNode) log('  ✓ Node.js project (package.json)', 'green');
    if (hasPython) log('  ✓ Python project (requirements.txt/pyproject.toml)', 'green');
    if (hasRust) log('  ✓ Rust project (Cargo.toml)', 'green');
    if (hasGo) log('  ✓ Go project (go.mod)', 'green');
    
    if (!hasNode && !hasPython && !hasRust && !hasGo) {
        log('\n❌ No package files found', 'red');
        log('   Looking for: package.json, requirements.txt, Cargo.toml, go.mod', 'yellow');
        return;
    }
    
    log('\n⏳ Running resolution...', 'blue');
    
    // Run the main resolver
    const indexPath = path.join(__dirname, 'index.js');
    await runCommand('node', [indexPath, dir], { cwd: dir });
    
    log('\n✅ Fix complete!', 'green');
    log('   Check .package_resolver_columns.json for results', 'yellow');
}

// Command: Interactive - Run terminal mode
async function runInteractive(dir) {
    log('🖥️  Starting interactive mode...', 'blue');
    log('   Commands: r=resolve, p=parse, c=correct, w=watch, q=quit\n', 'yellow');
    
    const indexPath = path.join(__dirname, 'index.js');
    await runCommand('node', [indexPath, dir, 'terminal'], { 
        cwd: dir,
        stdio: 'inherit'  // Allow user interaction
    });
}

// Command: Watch - Auto-re-resolve on changes
async function runWatch(dir) {
    log('👁️  Starting watch mode...', 'blue');
    log('   Will auto-fix when package files change', 'yellow');
    log('   Press Ctrl+C to stop\n', 'yellow');
    
    const indexPath = path.join(__dirname, 'index.js');
    await runCommand('node', [indexPath, dir, 'watch'], { 
        cwd: dir,
        stdio: 'inherit'
    });
}

// Command: Python Bridge - Direct Python control
async function runPythonBridge(dir) {
    log('🐍 Running Python bridge...', 'blue');
    
    const pyPath = path.join(__dirname, 'pipeline_bridge.py');
    await runCommand('python3', [pyPath, dir], { cwd: dir });
}

// Command: Status - Show current state
async function showStatus(dir) {
    log('📊 Status for: ' + path.resolve(dir), 'blue');
    
    // Check for generated files
    const columnFile = path.join(dir, '.package_resolver_columns.json');
    const manifestFile = path.join(dir, '.unified_manifest.json');
    const venvDir = path.join(dir, 'safely_contained_venv');
    
    log('\nGenerated Files:');
    if (fs.existsSync(columnFile)) {
        const data = JSON.parse(fs.readFileSync(columnFile, 'utf8'));
        log(`  ✓ Resolution data: ${data.columns?.length || 0} columns`, 'green');
    } else {
        log('  ✗ No resolution data (run: fix)', 'yellow');
    }
    
    if (fs.existsSync(venvDir)) {
        log('  ✓ Python venv: active', 'green');
    } else {
        log('  ✗ No Python venv', 'yellow');
    }
    
    // Count package files
    const counts = {
        node: fs.existsSync(path.join(dir, 'package.json')) ? 1 : 0,
        python: (fs.existsSync(path.join(dir, 'requirements.txt')) || 
                 fs.existsSync(path.join(dir, 'pyproject.toml'))) ? 1 : 0,
        rust: fs.existsSync(path.join(dir, 'Cargo.toml')) ? 1 : 0,
        go: fs.existsSync(path.join(dir, 'go.mod')) ? 1 : 0
    };
    
    const total = counts.node + counts.python + counts.rust + counts.go;
    log(`\nPackage Sources: ${total} detected`);
    if (counts.node) log('  - Node.js (npm)');
    if (counts.python) log('  - Python (pip)');
    if (counts.rust) log('  - Rust (cargo)');
    if (counts.go) log('  - Go (modules)');
}

// Helper: Run a command and return promise
function runCommand(cmd, args, options) {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, {
            ...options,
            stdio: options.stdio || 'pipe'
        });
        
        let stdout = '';
        let stderr = '';
        
        if (proc.stdout) {
            proc.stdout.on('data', (data) => {
                stdout += data.toString();
                if (options.stdio !== 'inherit') {
                    process.stdout.write(data);
                }
            });
        }
        
        if (proc.stderr) {
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
                if (options.stdio !== 'inherit') {
                    process.stderr.write(data);
                }
            });
        }
        
        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
            } else {
                reject(new Error(`Command failed with code ${code}`));
            }
        });
    });
}

// Show help
function showHelp() {
    log('USAGE: node CONTROL_CENTER.js <command> [directory]', 'blue');
    log('\nCommands:');
    log('  fix          Fix all package issues (default)');
    log('  interactive  Start interactive terminal mode');
    log('  watch        Watch for changes and auto-fix');
    log('  status       Show current project status');
    log('  python       Run Python bridge directly');
    log('  help         Show this help');
    log('\nExamples:');
    log('  node CONTROL_CENTER.js fix                    # Fix current directory');
    log('  node CONTROL_CENTER.js fix ./my-project       # Fix specific project');
    log('  node CONTROL_CENTER.js interactive            # Interactive mode');
    log('  node CONTROL_CENTER.js watch                  # Watch mode');
    log('  node CONTROL_CENTER.js status                 # Check status');
    log('\nWhat This Fixes:');
    log('  • npm install failures');
    log('  • pip install failures');
    log('  • Version conflicts');
    log('  • Missing packages');
    log('  • Cross-language dependency issues');
}

// Run main
main().catch(err => {
    log('\n❌ Error: ' + err.message, 'red');
    process.exit(1);
});
