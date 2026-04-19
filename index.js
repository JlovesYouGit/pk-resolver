const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// Universal Column-Based Package Resolver
// Handles all languages: npm, pypi, cargo, go, gem
class UniversalPackageResolver {
    constructor(parserDir) {
        this.parserDir = parserDir;
        this.columnStore = null;
        this.resolvedPackages = [];
        this.activeColumn = null;
    }

    // Auto-detect and resolve packages from current directory
    async resolve(workDir) {
        const resolverScript = path.join(this.parserDir, 'resolver.js');
        
        return new Promise((resolve, reject) => {
            const proc = spawn('node', [resolverScript, workDir], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            let error = '';

            proc.stdout.on('data', (data) => {
                output += data.toString();
            });

            proc.stderr.on('data', (data) => {
                const msg = data.toString().trim();
                if (msg) console.log('[Resolver]', msg);
            });

            proc.on('close', (code) => {
                try {
                    const lines = output.trim().split('\n');
                    const jsonLine = lines.find(l => l.trim().startsWith('{'));
                    const result = JSON.parse(jsonLine || output.trim());
                    
                    if (result.status === 'success') {
                        this.activeColumn = result;
                        this.resolvedPackages = result.packages || [];
                        this.loadColumnStore(workDir);
                    }
                    resolve(result);
                } catch (e) {
                    reject(new Error(`Parse error: ${e.message}, output: ${output}`));
                }
            });
        });
    }

    loadColumnStore(workDir) {
        const storePath = path.join(workDir, '.package_resolver_columns.json');
        if (fs.existsSync(storePath)) {
            try {
                this.columnStore = JSON.parse(fs.readFileSync(storePath, 'utf8'));
            } catch (e) {
                console.warn('Could not load column store:', e.message);
            }
        }
    }

    getColumnCount() {
        return this.columnStore?.columns?.length || 0;
    }

    getSuccessfulPatterns() {
        return this.columnStore?.patterns || [];
    }

    // Check if a pattern exists in successful columns
    hasSuccessfulPattern(packageName, version, language) {
        const pattern = `${packageName}@${version}:${language}`;
        const patterns = this.getSuccessfulPatterns();
        return patterns.some(p => p.includes(pattern));
    }

    // Install packages for a specific language
    async installLanguagePackages(language, workDir) {
        const storePath = path.join(workDir, '.package_resolver_columns.json');
        if (!fs.existsSync(storePath)) return;

        const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
        const activeColumn = store.active_column;
        
        if (!activeColumn || !activeColumn.packages) return;

        const packages = activeColumn.packages.filter(p => p.language === language);
        
        console.log(`\nInstalling ${packages.length} ${language} packages...`);
        
        for (const pkg of packages) {
            let cmd;
            switch (language) {
                case 'node':
                    cmd = `npm install ${pkg.name}@${pkg.version}`;
                    break;
                case 'python':
                    cmd = `pip install ${pkg.name}==${pkg.version}`;
                    break;
                case 'rust':
                    cmd = `cargo add ${pkg.name}@${pkg.version}`;
                    break;
                case 'go':
                    cmd = `go get ${pkg.name}@${pkg.version}`;
                    break;
            }
            
            if (cmd) {
                console.log(`  ${cmd}`);
                // In actual implementation, would execute the command here
            }
        }
    }
}

// Terminal Interruption Handler for live package monitoring and correction
class TerminalInterruption {
    constructor(resolver, workDir) {
        this.resolver = resolver;
        this.workDir = workDir;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.watching = false;
        this.lastCheck = null;
        this.installedPackages = new Map();
    }

    // Start interactive terminal session
    async start() {
        console.log('\n=== Terminal Interruption Mode ===');
        console.log('Commands: [r]esolve, [p]arse installed, [c]orrect, [w]atch, [q]uit');
        
        this.showPrompt();
        
        this.rl.on('line', async (input) => {
            const cmd = input.trim().toLowerCase();
            
            switch(cmd) {
                case 'r':
                case 'resolve':
                    await this.runResolution();
                    break;
                case 'p':
                case 'parse':
                    await this.parseInstalledPackages();
                    break;
                case 'c':
                case 'correct':
                    await this.reCorrectPackages();
                    break;
                case 'w':
                case 'watch':
                    await this.toggleWatchMode();
                    break;
                case 'q':
                case 'quit':
                    this.quit();
                    return;
                case 'h':
                case 'help':
                    this.showHelp();
                    break;
                default:
                    console.log('Unknown command. Type h for help.');
            }
            
            if (!this.watching) {
                this.showPrompt();
            }
        });
    }

    showPrompt() {
        process.stdout.write('\nresolver> ');
    }

    showHelp() {
        console.log('\nCommands:');
        console.log('  r/resolve    - Run package resolution');
        console.log('  p/parse      - Parse currently installed packages');
        console.log('  c/correct    - Re-correct packages in directory');
        console.log('  w/watch      - Toggle watch mode (auto-detect changes)');
        console.log('  q/quit       - Exit terminal mode');
        console.log('  h/help       - Show this help');
    }

    async runResolution() {
        console.log('\n>>> Running resolution...');
        try {
            const result = await this.resolver.resolve(this.workDir);
            if (result.status === 'success') {
                console.log('✓ Resolution complete');
                console.log(`  Column: ${result.column_id}`);
                console.log(`  Packages: ${result.packages}`);
            } else {
                console.log('✗ Resolution failed');
            }
        } catch (e) {
            console.error('Error:', e.message);
        }
    }

    // Parse actually installed packages by running native commands
    async parseInstalledPackages() {
        console.log('\n>>> Parsing installed packages...');
        
        const installed = {
            node: await this.parseNodePackages(),
            python: await this.parsePythonPackages(),
            rust: await this.parseRustPackages(),
            go: await this.parseGoPackages()
        };
        
        this.installedPackages = new Map();
        let total = 0;
        
        for (const [lang, packages] of Object.entries(installed)) {
            if (packages.length > 0) {
                console.log(`\n${lang}:`);
                for (const pkg of packages) {
                    console.log(`  ${pkg.name}@${pkg.version}`);
                    this.installedPackages.set(`${lang}:${pkg.name}`, pkg);
                    total++;
                }
            }
        }
        
        console.log(`\nTotal installed: ${total} packages`);
        this.lastCheck = new Date();
        
        return installed;
    }

    async parseNodePackages() {
        try {
            const { stdout } = await execAsync('npm list --json --depth=0', { cwd: this.workDir });
            const data = JSON.parse(stdout);
            const packages = [];
            
            if (data.dependencies) {
                for (const [name, info] of Object.entries(data.dependencies)) {
                    packages.push({ name, version: info.version, source: 'npm' });
                }
            }
            return packages;
        } catch (e) {
            return [];
        }
    }

    async parsePythonPackages() {
        try {
            const { stdout } = await execAsync('pip list --format=json', { cwd: this.workDir });
            const data = JSON.parse(stdout);
            return data.map(p => ({ name: p.name, version: p.version, source: 'pypi' }));
        } catch (e) {
            // Try pip freeze as fallback
            try {
                const { stdout } = await execAsync('pip freeze', { cwd: this.workDir });
                const packages = [];
                for (const line of stdout.split('\n')) {
                    const match = line.match(/^([a-zA-Z0-9_-]+)==(.+)$/);
                    if (match) {
                        packages.push({ name: match[1], version: match[2], source: 'pypi' });
                    }
                }
                return packages;
            } catch (e2) {
                return [];
            }
        }
    }

    async parseRustPackages() {
        try {
            const { stdout } = await execAsync('cargo tree --depth 1 --format "{p}"', { cwd: this.workDir });
            const packages = [];
            for (const line of stdout.split('\n')) {
                const match = line.match(/^([a-zA-Z0-9_-]+)\s*v([\d.]+)/);
                if (match) {
                    packages.push({ name: match[1], version: match[2], source: 'cargo' });
                }
            }
            return packages;
        } catch (e) {
            return [];
        }
    }

    async parseGoPackages() {
        try {
            const { stdout } = await execAsync('go list -m all', { cwd: this.workDir });
            const packages = [];
            for (const line of stdout.split('\n').slice(1)) { // Skip first line (module itself)
                const parts = line.split(' ');
                if (parts.length >= 2) {
                    packages.push({ name: parts[0], version: parts[1], source: 'go' });
                }
            }
            return packages;
        } catch (e) {
            return [];
        }
    }

    // Re-correct packages by comparing installed with resolved
    async reCorrectPackages() {
        console.log('\n>>> Re-correcting packages...');
        
        if (this.installedPackages.size === 0) {
            console.log('No installed packages cached. Run parse first.');
            return;
        }
        
        // Load resolved packages from column store
        const storePath = path.join(this.workDir, '.package_resolver_columns.json');
        if (!fs.existsSync(storePath)) {
            console.log('No resolution data found. Run resolve first.');
            return;
        }
        
        const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
        const resolved = store.active_column?.packages || [];
        
        console.log(`\nComparing ${this.installedPackages.size} installed vs ${resolved.length} resolved...`);
        
        const corrections = [];
        const toInstall = [];
        const toRemove = [];
        
        // Check for mismatches
        for (const resolvedPkg of resolved) {
            const key = `${resolvedPkg.language}:${resolvedPkg.name}`;
            const installed = this.installedPackages.get(key);
            
            if (!installed) {
                toInstall.push(resolvedPkg);
            } else if (installed.version !== resolvedPkg.version) {
                corrections.push({
                    name: resolvedPkg.name,
                    language: resolvedPkg.language,
                    current: installed.version,
                    target: resolvedPkg.version
                });
            }
        }
        
        // Check for extra installed packages not in resolution
        for (const [key, installed] of this.installedPackages) {
            const [lang, name] = key.split(':');
            const inResolution = resolved.find(r => r.language === lang && r.name === name);
            if (!inResolution) {
                toRemove.push(installed);
            }
        }
        
        // Show results
        if (toInstall.length > 0) {
            console.log(`\nTo install (${toInstall.length}):`);
            for (const pkg of toInstall) {
                console.log(`  + ${pkg.name}@${pkg.version} (${pkg.language})`);
            }
        }
        
        if (corrections.length > 0) {
            console.log(`\nTo upgrade/downgrade (${corrections.length}):`);
            for (const c of corrections) {
                console.log(`  ~ ${c.name}: ${c.current} → ${c.target} (${c.language})`);
            }
        }
        
        if (toRemove.length > 0) {
            console.log(`\nTo remove (${toRemove.length}):`);
            for (const pkg of toRemove) {
                console.log(`  - ${pkg.name}@${pkg.version}`);
            }
        }
        
        if (toInstall.length === 0 && corrections.length === 0 && toRemove.length === 0) {
            console.log('\n✓ All packages are correctly installed');
        } else {
            console.log(`\nTotal corrections needed: ${toInstall.length + corrections.length + toRemove.length}`);
            console.log('Run apply-corrections to execute these changes');
        }
    }

    // Watch mode - auto-detect changes in directory
    async toggleWatchMode() {
        if (this.watching) {
            console.log('\n>>> Stopping watch mode');
            this.watching = false;
            return;
        }
        
        console.log('\n>>> Starting watch mode (press w again to stop)');
        console.log('Monitoring for package file changes...');
        this.watching = true;
        
        const watchedFiles = [
            'package.json',
            'package-lock.json',
            'requirements.txt',
            'Cargo.toml',
            'Cargo.lock',
            'go.mod',
            'go.sum',
            'Gemfile',
            'Gemfile.lock'
        ];
        
        let lastMtimes = new Map();
        
        // Initial scan
        for (const file of watchedFiles) {
            const filePath = path.join(this.workDir, file);
            try {
                const stat = fs.statSync(filePath);
                lastMtimes.set(file, stat.mtimeMs);
            } catch (e) {
                // File doesn't exist
            }
        }
        
        // Watch loop
        const checkInterval = setInterval(async () => {
            if (!this.watching) {
                clearInterval(checkInterval);
                return;
            }
            
            for (const file of watchedFiles) {
                const filePath = path.join(this.workDir, file);
                try {
                    const stat = fs.statSync(filePath);
                    const lastMtime = lastMtimes.get(file) || 0;
                    
                    if (stat.mtimeMs > lastMtime) {
                        console.log(`\n[Watch] ${file} changed`);
                        lastMtimes.set(file, stat.mtimeMs);
                        
                        // Auto-trigger re-correction
                        await this.runResolution();
                        await this.parseInstalledPackages();
                        await this.reCorrectPackages();
                        
                        console.log('\n[Watch] Waiting for changes...');
                    }
                } catch (e) {
                    // File doesn't exist or error
                }
            }
        }, 2000); // Check every 2 seconds
    }

    quit() {
        console.log('\nExiting terminal mode...');
        this.watching = false;
        this.rl.close();
        process.exit(0);
    }
}

class NodeVenvManager {
    constructor(configPath) {
        this.configPath = configPath;
        this.goProcess = null;
        this.status = { active: false, nodeName: null, pid: null };
    }

    async start() {
        const goBinary = path.join(__dirname, 'venv_manager');
        
        // Spawn Go executable as subprocess
        this.goProcess = spawn(goBinary, [this.configPath], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Capture status JSON from Go on stdout
        this.goProcess.stdout.on('data', (data) => {
            try {
                const status = JSON.parse(data.toString().trim());
                this.status = status;
                console.log('Node active status:', status);
            } catch (e) {
                console.log('Go output:', data.toString());
            }
        });

        // Capture stderr logs
        this.goProcess.stderr.on('data', (data) => {
            console.log('[Go]', data.toString().trim());
        });

        this.goProcess.on('close', (code) => {
            console.log(`Go subprocess exited with code ${code}`);
            this.status.active = false;
        });

        // Wait a moment for status initialization
        await new Promise(r => setTimeout(r, 1000));
        return this.status;
    }

    stop() {
        if (this.goProcess) {
            this.goProcess.kill();
            this.status.active = false;
        }
    }

    getStatus() {
        return this.status;
    }
}

// Main execution - Universal Package Resolver with Terminal Interruption
async function main() {
    const workDir = process.argv[2] || process.cwd();
    const mode = process.argv[3] || 'auto'; // 'auto', 'terminal', 'watch'
    const parserDir = path.join(__dirname, 'library parser logic');
    
    console.log('=== Universal Column-Based Package Resolver ===');
    console.log('Working directory:', workDir);
    console.log('Mode:', mode);
    
    // Initialize resolver
    const resolver = new UniversalPackageResolver(parserDir);
    
    // Auto-detect and resolve packages first
    console.log('\n=== Auto-Detecting and Resolving Packages ===');
    try {
        const result = await resolver.resolve(workDir);
        
        if (result.status === 'success') {
            console.log('\n✓ Initial resolution complete');
            console.log('  Column ID:', result.column_id);
            console.log('  Packages resolved:', result.packages);
            console.log('  No conflict:', result.no_conflict);
            console.log('  GF value:', result.gf_value?.toFixed(4));
            console.log('  H value:', result.h_value?.toFixed(4));
            console.log('  Total columns in store:', resolver.getColumnCount());
        } else {
            console.log('\n⚠ Initial resolution incomplete');
        }
    } catch (e) {
        console.error('Initial resolution error:', e.message);
    }
    
    // Enter terminal interruption mode if requested
    if (mode === 'terminal' || mode === 'interactive') {
        const terminal = new TerminalInterruption(resolver, workDir);
        await terminal.start();
    } else if (mode === 'watch') {
        const terminal = new TerminalInterruption(resolver, workDir);
        await terminal.toggleWatchMode();
        // Keep process alive
        await new Promise(() => {});
    } else {
        // Auto mode - just show install commands
        console.log('\n=== Install Commands ===');
        await resolver.installLanguagePackages('node', workDir);
        await resolver.installLanguagePackages('python', workDir);
        await resolver.installLanguagePackages('rust', workDir);
        await resolver.installLanguagePackages('go', workDir);
        
        console.log('\n✓ Resolution complete. Run with "terminal" arg for interactive mode:');
        console.log('  node index.js <dir> terminal');
    }
}

main().catch(console.error);
