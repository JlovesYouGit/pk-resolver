#!/usr/bin/env node
/**
 * Central Orchestrator - Node.js as Main Process
 * Treats all language packages as unified Python environment
 * Spawns Python subprocess for native package management
 * Hardcoded Cobold Bridge for quantity tracking
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const readline = require('readline');
const execAsync = util.promisify(exec);

// Cobold Bridge - Hardcoded quantity tracking system
class CoboldBridge {
    constructor(workDir) {
        this.workDir = workDir;
        this.quantities = new Map();
        this.unityMatrix = new Map();
        this.bridgePath = path.join(workDir, '.cobold_bridge.json');
        this.locked = false;
    }

    // Calculate unified quantity treating all packages as one environment
    calculateUnifiedQuantity(packages) {
        const quantities = {
            total: packages.length,
            byLanguage: {},
            bySource: {},
            unifiedScore: 0,
            treeDepth: 0,
            crossLangDeps: 0
        };

        for (const pkg of packages) {
            // Count by language
            quantities.byLanguage[pkg.language] = (quantities.byLanguage[pkg.language] || 0) + 1;
            
            // Count by source
            quantities.bySource[pkg.source] = (quantities.bySource[pkg.source] || 0) + 1;
            
            // Calculate unified score (GF * H normalized)
            const score = (pkg.gf || 0) * (pkg.h || 0) / 100;
            quantities.unifiedScore += score;
        }

        quantities.unifiedScore = quantities.unifiedScore / (packages.length || 1);
        
        // Calculate cross-language dependencies
        const languages = Object.keys(quantities.byLanguage);
        quantities.crossLangDeps = languages.length > 1 ? languages.length * 10 : 0;
        
        return quantities;
    }

    // Lock the bridge with current quantities
    lockQuantities(packages) {
        if (this.locked) return false;
        
        const quantities = this.calculateUnifiedQuantity(packages);
        this.quantities.set('current', quantities);
        
        const bridgeData = {
            timestamp: Date.now(),
            locked: true,
            quantities: quantities,
            packages: packages.map(p => ({
                name: p.name,
                version: p.version,
                language: p.language,
                unifiedId: `${p.language}:${p.name}@${p.version}`
            })),
            unityMatrix: this.buildUnityMatrix(packages)
        };
        
        fs.writeFileSync(this.bridgePath, JSON.stringify(bridgeData, null, 2));
        this.locked = true;
        return true;
    }

    // Build unity matrix showing cross-language relationships
    buildUnityMatrix(packages) {
        const matrix = {};
        
        for (const pkg of packages) {
            const id = `${pkg.language}:${pkg.name}`;
            matrix[id] = {
                unified: true,
                equivalents: packages
                    .filter(p => p.name === pkg.name && p.language !== pkg.language)
                    .map(p => `${p.language}:${p.name}@${p.version}`),
                treePosition: this.calculateTreePosition(pkg, packages)
            };
        }
        
        return matrix;
    }

    calculateTreePosition(pkg, allPackages) {
        // Position in unified dependency tree
        const sameLang = allPackages.filter(p => p.language === pkg.language);
        const index = sameLang.findIndex(p => p.name === pkg.name);
        return {
            depth: Math.floor((pkg.gf || 0) / 10),
            breadth: index,
            unifiedIndex: allPackages.indexOf(pkg)
        };
    }

    // Unlock and allow modifications
    unlock() {
        this.locked = false;
        if (fs.existsSync(this.bridgePath)) {
            const data = JSON.parse(fs.readFileSync(this.bridgePath, 'utf8'));
            data.locked = false;
            data.timestamp = Date.now();
            fs.writeFileSync(this.bridgePath, JSON.stringify(data, null, 2));
        }
    }

    // Get current quantities
    getQuantities() {
        if (fs.existsSync(this.bridgePath)) {
            const data = JSON.parse(fs.readFileSync(this.bridgePath, 'utf8'));
            return data.quantities;
        }
        return null;
    }
}

// Unified Environment - Treats all packages as Python environment
class UnifiedEnvironment {
    constructor(workDir) {
        this.workDir = workDir;
        this.packages = [];
        this.dependencyTree = new Map();
        this.pythonVenvPath = path.join(workDir, 'unified_venv');
        this.manifestPath = path.join(workDir, '.unified_manifest.json');
    }

    // Add package from any language as if it's in Python environment
    addPackage(pkg) {
        const unifiedPkg = {
            ...pkg,
            unifiedId: `${pkg.language}:${pkg.name}@${pkg.version}`,
            pythonEquivalent: this.getPythonEquivalent(pkg),
            virtualPath: this.getVirtualPath(pkg),
            treeNode: null
        };
        
        this.packages.push(unifiedPkg);
        this.updateDependencyTree(unifiedPkg);
        
        return unifiedPkg;
    }

    // Get Python equivalent name for non-Python packages
    getPythonEquivalent(pkg) {
        const equivalents = {
            'lodash': 'pydash',
            'axios': 'requests',
            'express': 'flask',
            'react': 'reflex',
            'numpy': 'numpy',
            'pandas': 'pandas'
        };
        
        return equivalents[pkg.name] || `py-${pkg.name}`;
    }

    // Get virtual path where package appears to reside
    getVirtualPath(pkg) {
        if (pkg.language === 'python') {
            return path.join(this.pythonVenvPath, 'lib', 'python3', 'site-packages', pkg.name);
        }
        // Non-Python packages appear in unified node_modules
        return path.join(this.workDir, 'node_modules', '.unified', pkg.language, pkg.name);
    }

    updateDependencyTree(pkg) {
        // Build tree relationships
        if (!this.dependencyTree.has(pkg.language)) {
            this.dependencyTree.set(pkg.language, new Map());
        }
        
        const langTree = this.dependencyTree.get(pkg.language);
        langTree.set(pkg.name, {
            version: pkg.version,
            unifiedId: pkg.unifiedId,
            dependsOn: [],
            dependedBy: []
        });
        
        // Link cross-language dependencies
        for (const other of this.packages) {
            if (other.language !== pkg.language && other.name === pkg.name) {
                const node = langTree.get(pkg.name);
                if (!node.dependsOn.includes(other.unifiedId)) {
                    node.dependsOn.push(other.unifiedId);
                }
            }
        }
    }

    // Unify all dependency trees into single structure
    unifyTrees() {
        const unified = {
            root: 'unified_environment',
            packages: {},
            crossLinks: [],
            treeSignature: ''
        };

        // Build unified package map
        for (const pkg of this.packages) {
            unified.packages[pkg.unifiedId] = {
                name: pkg.name,
                version: pkg.version,
                language: pkg.language,
                virtualPath: pkg.virtualPath,
                pythonEquivalent: pkg.pythonEquivalent,
                gf: pkg.gf || 0,
                h: pkg.h || 0
            };
        }

        // Build cross-language links
        const names = new Set(this.packages.map(p => p.name));
        for (const name of names) {
            const sameName = this.packages.filter(p => p.name === name);
            if (sameName.length > 1) {
                unified.crossLinks.push({
                    name: name,
                    instances: sameName.map(p => p.unifiedId),
                    unified: true
                });
            }
        }

        // Generate tree signature
        unified.treeSignature = this.generateTreeSignature(unified.packages);

        return unified;
    }

    generateTreeSignature(packages) {
        const ids = Object.keys(packages).sort();
        return require('crypto')
            .createHash('sha256')
            .update(ids.join('|'))
            .digest('hex')
            .substring(0, 16);
    }

    saveManifest() {
        const unified = this.unifyTrees();
        fs.writeFileSync(this.manifestPath, JSON.stringify(unified, null, 2));
        return unified;
    }
}

// Python Subprocess Bridge - Controlled by Node
class PythonSubBridge {
    constructor(workDir, nodepackDir) {
        this.workDir = workDir;
        this.nodepackDir = nodepackDir;
        this.pythonScript = path.join(nodepackDir, 'python_subbridge.py');
        this.process = null;
        this.messageQueue = [];
        this.connected = false;
    }

    // Spawn Python as subprocess of Node
    async spawn() {
        return new Promise((resolve, reject) => {
            this.process = spawn('python3', [
                this.pythonScript,
                this.workDir,
                this.nodepackDir
            ], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: this.workDir
            });

            let initData = '';

            this.process.stdout.on('data', (data) => {
                const msg = data.toString();
                
                // Check for init complete
                if (msg.includes('[PYTHON_BRIDGE_READY]')) {
                    this.connected = true;
                    console.log('[Node] Python subprocess connected');
                    resolve(true);
                    return;
                }

                // Parse JSON messages
                try {
                    const lines = msg.split('\n');
                    for (const line of lines) {
                        if (line.trim().startsWith('{')) {
                            const json = JSON.parse(line);
                            this.handleMessage(json);
                        }
                    }
                } catch (e) {
                    // Non-JSON output
                    console.log('[Python]', msg.trim());
                }
            });

            this.process.stderr.on('data', (data) => {
                console.error('[Python Error]', data.toString().trim());
            });

            this.process.on('close', (code) => {
                this.connected = false;
                console.log(`[Node] Python subprocess exited with code ${code}`);
            });

            // Timeout for connection
            setTimeout(() => {
                if (!this.connected) {
                    reject(new Error('Python bridge connection timeout'));
                }
            }, 10000);
        });
    }

    handleMessage(msg) {
        this.messageQueue.push(msg);
        
        switch (msg.type) {
            case 'packages_detected':
                console.log(`[Node] Python detected ${msg.count} packages`);
                break;
            case 'install_complete':
                console.log(`[Node] Python installed ${msg.package}`);
                break;
            case 'error':
                console.error(`[Node] Python error: ${msg.message}`);
                break;
        }
    }

    // Send command to Python subprocess
    sendCommand(cmd, data = {}) {
        if (!this.connected || !this.process) {
            console.error('[Node] Python bridge not connected');
            return false;
        }

        const message = JSON.stringify({ command: cmd, data, timestamp: Date.now() });
        this.process.stdin.write(message + '\n');
        return true;
    }

    // Install package via Python bridge
    installPackage(pkg) {
        return this.sendCommand('install', pkg);
    }

    // Request package list from Python
    requestPackages() {
        return this.sendCommand('list_packages');
    }

    // Kill Python subprocess
    kill() {
        if (this.process) {
            this.process.kill();
            this.connected = false;
        }
    }
}

// Central Orchestrator - Main Node Process
class CentralOrchestrator {
    constructor(workDir) {
        this.workDir = workDir;
        this.nodepackDir = path.join(__dirname);
        this.cobold = new CoboldBridge(workDir);
        this.unifiedEnv = new UnifiedEnvironment(workDir);
        this.pythonBridge = new PythonSubBridge(workDir, this.nodepackDir);
        this.resolver = null;
        this.running = false;
    }

    async initialize() {
        console.log('=== Central Orchestrator (Node.js) ===');
        console.log('Work directory:', this.workDir);
        console.log('Treats all packages as unified Python environment\n');

        // Step 1: Spawn Python subprocess
        console.log('[1/4] Spawning Python subprocess...');
        try {
            await this.pythonBridge.spawn();
        } catch (e) {
            console.error('Failed to spawn Python bridge:', e.message);
            return false;
        }

        // Step 2: Run Node.js resolver for initial resolution
        console.log('[2/4] Running Node.js resolver...');
        await this.runNodeResolver();

        // Step 3: Build unified environment
        console.log('[3/4] Building unified environment...');
        this.buildUnifiedEnvironment();

        // Step 4: Lock Cobold bridge
        console.log('[4/4] Locking Cobold bridge...');
        this.cobold.lockQuantities(this.unifiedEnv.packages);

        console.log('\n✓ Central orchestrator initialized');
        return true;
    }

    async runNodeResolver() {
        const resolverPath = path.join(this.nodepackDir, 'library parser logic', 'resolver.js');
        
        return new Promise((resolve, reject) => {
            const proc = spawn('node', [resolverPath, this.workDir], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';

            proc.stdout.on('data', (data) => {
                output += data.toString();
            });

            proc.stderr.on('data', (data) => {
                console.log('[Resolver]', data.toString().trim());
            });

            proc.on('close', (code) => {
                // Load resolved packages
                const storePath = path.join(this.workDir, '.package_resolver_columns.json');
                if (fs.existsSync(storePath)) {
                    const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
                    this.resolver = store;
                    resolve(store);
                } else {
                    resolve(null);
                }
            });
        });
    }

    buildUnifiedEnvironment() {
        // Add all resolved packages to unified environment
        if (this.resolver && this.resolver.active_column) {
            const packages = this.resolver.active_column.packages || [];
            
            for (const pkg of packages) {
                this.unifiedEnv.addPackage(pkg);
            }

            // Unify dependency trees
            const unified = this.unifiedEnv.unifyTrees();
            this.unifiedEnv.saveManifest();

            console.log(`  Unified ${packages.length} packages into single environment`);
            console.log(`  Tree signature: ${unified.treeSignature}`);
            console.log(`  Cross-language links: ${unified.crossLinks.length}`);
        }
    }

    // Main orchestration loop
    async orchestrationLoop() {
        this.running = true;
        console.log('\n[Orchestration] Loop started');

        while (this.running) {
            try {
                // Request package updates from Python
                this.pythonBridge.requestPackages();

                // Check for messages from Python
                while (this.pythonBridge.messageQueue.length > 0) {
                    const msg = this.pythonBridge.messageQueue.shift();
                    await this.handlePythonMessage(msg);
                }

                await new Promise(r => setTimeout(r, 2000));
            } catch (e) {
                console.error('[Orchestration] Error:', e.message);
            }
        }
    }

    async handlePythonMessage(msg) {
        switch (msg.type) {
            case 'packages_detected':
                // Sync with unified environment
                for (const pkg of msg.packages) {
                    if (!this.unifiedEnv.packages.find(p => p.unifiedId === pkg.unifiedId)) {
                        this.unifiedEnv.addPackage(pkg);
                    }
                }
                break;
            
            case 'install_request':
                // Python requests installation
                console.log(`[Orchestration] Python requests install: ${pkg.name}`);
                // Could trigger re-resolution here
                break;
        }
    }

    // Install package treating all as Python environment
    async installUnified(pkg) {
        // Add to unified environment first
        const unifiedPkg = this.unifiedEnv.addPackage(pkg);
        
        // Send to Python bridge for actual installation
        if (pkg.language === 'python') {
            this.pythonBridge.installPackage(pkg);
        } else {
            // For non-Python, install via native then sync to Python view
            console.log(`[Orchestration] Installing ${pkg.language} package ${pkg.name}`);
            // Native installation would happen here
        }

        // Update Cobold quantities
        this.cobold.lockQuantities(this.unifiedEnv.packages);
        
        return unifiedPkg;
    }

    stop() {
        this.running = false;
        this.pythonBridge.kill();
        this.cobold.unlock();
        console.log('[Orchestration] Stopped');
    }
}

// Main entry
async function main() {
    const workDir = process.argv[2] || process.cwd();
    const mode = process.argv[3] || 'run'; // run, loop

    const orchestrator = new CentralOrchestrator(workDir);
    
    const initialized = await orchestrator.initialize();
    if (!initialized) {
        process.exit(1);
    }

    if (mode === 'loop') {
        // Set up signal handlers
        process.on('SIGINT', () => {
            console.log('\nShutting down...');
            orchestrator.stop();
            process.exit(0);
        });

        await orchestrator.orchestrationLoop();
    } else {
        console.log('\nRun complete. Use "loop" mode for continuous operation:');
        console.log('  node central_orchestrator.js <dir> loop');
        orchestrator.stop();
    }
}

main().catch(console.error);
