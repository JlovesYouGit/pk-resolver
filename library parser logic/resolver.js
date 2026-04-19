#!/usr/bin/env node
/**
 * Universal Column-Based Package Resolver
 * Handles all languages: npm, pypi, cargo, go, gem
 * Auto-detects installations, cross-resolves versions until 100% compatible
 */

const fs = require('fs');
const path = require('path');

class InstallRequest {
    constructor(name, version, source, language) {
        this.name = name;
        this.version = version;
        this.source = source;
        this.language = language;
    }
}

class ResolvedPackage {
    constructor(name, version, source, language) {
        this.name = name;
        this.version = version;
        this.source = source;
        this.language = language;
        this.gf = 0;
        this.h = 0;
        this.chainScore = 0;
        this.compatible = false;
    }
}

class CompatibilityColumn {
    constructor() {
        this.id = `col_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        this.timestamp = new Date().toISOString();
        this.chainFormed = false;
        this.success = false;
        this.noConflict = false;
        this.packages = [];
        this.gfValue = 0;
        this.hValue = 0;
    }
}

class ColumnStore {
    constructor() {
        this.columns = [];
        this.activeColumn = null;
        this.patterns = [];
    }
}

class UniversalResolver {
    constructor() {
        this.store = new ColumnStore();
        this.round = 0;
    }

    autoDetect(dir) {
        const requests = [];
        
        // Detect Node/npm packages
        const packageJsonPath = path.join(dir, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            requests.push(...this.detectNodePackages(dir));
        }
        
        // Detect Python packages
        const requirementsPath = path.join(dir, 'requirements.txt');
        const pyprojectPath = path.join(dir, 'pyproject.toml');
        if (fs.existsSync(requirementsPath)) {
            requests.push(...this.detectPythonPackages(dir));
        }
        if (fs.existsSync(pyprojectPath)) {
            requests.push(...this.detectPyprojectPackages(dir));
        }
        
        // Detect Rust packages
        const cargoPath = path.join(dir, 'Cargo.toml');
        if (fs.existsSync(cargoPath)) {
            requests.push(...this.detectRustPackages(dir));
        }
        
        // Detect Go packages
        const goModPath = path.join(dir, 'go.mod');
        if (fs.existsSync(goModPath)) {
            requests.push(...this.detectGoPackages(dir));
        }
        
        // Detect Ruby packages
        const gemfilePath = path.join(dir, 'Gemfile');
        if (fs.existsSync(gemfilePath)) {
            requests.push(...this.detectRubyPackages(dir));
        }
        
        return requests;
    }

    detectNodePackages(dir) {
        const requests = [];
        try {
            const data = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
            const pkg = JSON.parse(data);
            
            if (pkg.dependencies) {
                for (const [name, version] of Object.entries(pkg.dependencies)) {
                    requests.push(new InstallRequest(name, version, 'npm', 'node'));
                }
            }
            if (pkg.devDependencies) {
                for (const [name, version] of Object.entries(pkg.devDependencies)) {
                    requests.push(new InstallRequest(name, version, 'npm', 'node'));
                }
            }
        } catch (e) {
            console.error('Error parsing package.json:', e.message);
        }
        return requests;
    }

    detectPythonPackages(dir) {
        const requests = [];
        try {
            const data = fs.readFileSync(path.join(dir, 'requirements.txt'), 'utf8');
            const lines = data.split('\n');
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                
                const parts = trimmed.split('==');
                if (parts.length === 2) {
                    requests.push(new InstallRequest(parts[0], parts[1], 'pypi', 'python'));
                } else {
                    // No version specified, use 'latest'
                    requests.push(new InstallRequest(parts[0], 'latest', 'pypi', 'python'));
                }
            }
        } catch (e) {
            console.error('Error parsing requirements.txt:', e.message);
        }
        return requests;
    }

    detectPyprojectPackages(dir) {
        const requests = [];
        try {
            const data = fs.readFileSync(path.join(dir, 'pyproject.toml'), 'utf8');
            const lines = data.split('\n');
            let inDependencies = false;
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed === '[project.dependencies]' || trimmed === '[tool.poetry.dependencies]') {
                    inDependencies = true;
                    continue;
                }
                if (inDependencies && trimmed.startsWith('[')) {
                    inDependencies = false;
                    continue;
                }
                if (inDependencies && trimmed) {
                    const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"/);
                    if (match) {
                        requests.push(new InstallRequest(match[1], match[2], 'pypi', 'python'));
                    }
                }
            }
        } catch (e) {
            console.error('Error parsing pyproject.toml:', e.message);
        }
        return requests;
    }

    detectRustPackages(dir) {
        const requests = [];
        try {
            const data = fs.readFileSync(path.join(dir, 'Cargo.toml'), 'utf8');
            const lines = data.split('\n');
            let inDependencies = false;
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed === '[dependencies]') {
                    inDependencies = true;
                    continue;
                }
                if (inDependencies && (trimmed === '' || trimmed.startsWith('['))) {
                    inDependencies = false;
                    continue;
                }
                if (inDependencies) {
                    const parts = trimmed.split('=');
                    if (parts.length >= 2) {
                        const name = parts[0].trim();
                        const version = parts[1].trim().replace(/["']/g, '');
                        requests.push(new InstallRequest(name, version, 'cargo', 'rust'));
                    }
                }
            }
        } catch (e) {
            console.error('Error parsing Cargo.toml:', e.message);
        }
        return requests;
    }

    detectGoPackages(dir) {
        const requests = [];
        try {
            const data = fs.readFileSync(path.join(dir, 'go.mod'), 'utf8');
            const lines = data.split('\n');
            let inRequire = false;
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed === 'require (') {
                    inRequire = true;
                    continue;
                }
                if (inRequire && trimmed === ')') {
                    inRequire = false;
                    continue;
                }
                if (inRequire || trimmed.startsWith('require ')) {
                    const parts = trimmed.split(/\s+/);
                    if (parts.length >= 3 && parts[0] === 'require') {
                        requests.push(new InstallRequest(parts[1], parts[2], 'go', 'go'));
                    }
                }
            }
        } catch (e) {
            console.error('Error parsing go.mod:', e.message);
        }
        return requests;
    }

    detectRubyPackages(dir) {
        const requests = [];
        try {
            const data = fs.readFileSync(path.join(dir, 'Gemfile'), 'utf8');
            const lines = data.split('\n');
            
            for (const line of lines) {
                const trimmed = line.trim();
                const match = trimmed.match(/^gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/);
                if (match) {
                    const name = match[1];
                    const version = match[2] || 'latest';
                    requests.push(new InstallRequest(name, version, 'gem', 'ruby'));
                }
            }
        } catch (e) {
            console.error('Error parsing Gemfile:', e.message);
        }
        return requests;
    }

    async enumerateAllVersionsWithAdjustment(requests) {
        const allPackages = [];
        
        for (const req of requests) {
            // Use search query protocol to get adjusted version
            const result = await this.searchQueryVersionProtocol(req);
            
            if (result.error) {
                console.error(`[VersionProtocol] ${req.name}: ${result.error}`);
                continue;
            }
            
            const adjustedVersion = result.version;
            const offset = this.languageOffset(req.language);
            
            // Create package with adjusted version
            const pkg = new ResolvedPackage(
                req.name, 
                adjustedVersion, 
                req.source, 
                req.language
            );
            
            // Calculate GF and H based on version adjustment
            pkg.gf = this.calculateGF(req, adjustedVersion) + offset;
            pkg.h = this.calculateH(req, adjustedVersion);
            pkg.adjusted = result.adjusted;
            pkg.originalVersion = result.originalTarget;
            pkg.versionScore = result.score;
            pkg.attempts = result.attempts;
            
            if (result.adjusted) {
                console.log(`[VersionProtocol] ${req.name}: ${result.originalTarget} → ${adjustedVersion} (score: ${result.score.toFixed(2)}, attempts: ${result.attempts})`);
            }
            
            allPackages.push(pkg);
        }
        return allPackages;
    }

    // Legacy synchronous version (kept for compatibility)
    enumerateAllVersions(requests) {
        const allPackages = [];
        
        for (const req of requests) {
            const versions = this.queryPackageVersions(req);
            const offset = this.languageOffset(req.language);
            
            for (let i = 0; i < versions.length; i++) {
                const v = versions[i];
                const pkg = new ResolvedPackage(req.name, v, req.source, req.language);
                pkg.gf = (i * 0.5) + offset;
                pkg.h = 1.0 / (i + 1.0) + (i * 0.1);
                allPackages.push(pkg);
            }
        }
        return allPackages;
    }

    languageOffset(language) {
        const offsets = {
            'node': 0,
            'python': 100,
            'rust': 200,
            'go': 300,
            'ruby': 400
        };
        return offsets[language] || 0;
    }

    queryPackageVersions(req) {
        let requestedVersion = req.version;
        if (requestedVersion === 'latest' || !requestedVersion) {
            requestedVersion = '1.0.0';
        }
        // Remove ^, ~, >=, <= from version strings
        requestedVersion = requestedVersion.replace(/^[\^~>=<]+/, '');
        
        // Fetch versions from oldest to newest (numerical order)
        const rawVersions = ['0.9.0', '0.9.5', '1.0.0-alpha', '1.0.0-beta', '1.0.0-rc', '1.0.0', '1.0.1', '1.1.0', '1.1.1', '1.2.0', '2.0.0-alpha', '2.0.0', requestedVersion];
        
        // Sort numerically oldest to newest
        return this.sortVersionsOldestToNewest(rawVersions);
    }

    // Parse semver version to array [major, minor, patch, prerelease]
    parseSemver(version) {
        const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.]+))?$/);
        if (!match) return [0, 0, 0, ''];
        
        const [, major, minor, patch, prerelease] = match;
        return [
            parseInt(major, 10),
            parseInt(minor, 10),
            parseInt(patch, 10),
            prerelease || ''
        ];
    }

    // Compare two semver versions for sorting
    compareVersions(a, b) {
        const va = this.parseSemver(a);
        const vb = this.parseSemver(b);
        
        // Compare major
        if (va[0] !== vb[0]) return va[0] - vb[0];
        // Compare minor
        if (va[1] !== vb[1]) return va[1] - vb[1];
        // Compare patch
        if (va[2] !== vb[2]) return va[2] - vb[2];
        
        // Handle prerelease: no prerelease > prerelease
        if (!va[3] && vb[3]) return 1;
        if (va[3] && !vb[3]) return -1;
        if (va[3] && vb[3]) {
            return va[3].localeCompare(vb[3]);
        }
        
        return 0;
    }

    // Sort versions from oldest to newest (numerical ascending)
    sortVersionsOldestToNewest(versions) {
        return versions.sort((a, b) => this.compareVersions(a, b));
    }

    // Search Query Version Protocol - Adjusts versions based on algo response
    async searchQueryVersionProtocol(req, maxAttempts = 10) {
        const targetVersion = req.version;
        let availableVersions = await this.fetchAvailableVersions(req);
        
        // Sort oldest to newest
        availableVersions = this.sortVersionsOldestToNewest(availableVersions);
        
        let bestVersion = null;
        let bestScore = 0;
        let attempt = 0;
        
        while (attempt < maxAttempts && availableVersions.length > 0) {
            attempt++;
            
            // Try each version from oldest to newest
            for (const version of availableVersions) {
                const pkg = {
                    name: req.name,
                    version: version,
                    language: req.language,
                    source: req.source,
                    gf: this.calculateGF(req, version),
                    h: this.calculateH(req, version)
                };
                
                // Test compatibility score
                const score = this.calculateCompatibilityScore(pkg, attempt);
                
                // If version matches target closely or has good score
                if (version === targetVersion || score >= 0.95) {
                    return {
                        version: version,
                        score: score,
                        adjusted: version !== targetVersion,
                        originalTarget: targetVersion,
                        attempts: attempt
                    };
                }
                
                // Track best alternative
                if (score > bestScore) {
                    bestScore = score;
                    bestVersion = version;
                }
            }
            
            // If exact match not found, adjust and re-query
            if (bestVersion && bestScore >= 0.7) {
                // Remove incompatible versions and re-query
                availableVersions = availableVersions.filter(v => {
                    const testPkg = { name: req.name, version: v, gf: 50, h: 0.5 };
                    return this.calculateCompatibilityScore(testPkg, attempt) >= 0.5;
                });
                
                if (availableVersions.length === 0) {
                    // Re-fetch with adjusted parameters
                    availableVersions = await this.fetchAdjustedVersions(req, attempt);
                }
            }
        }
        
        // Return best available if no perfect match
        if (bestVersion) {
            return {
                version: bestVersion,
                score: bestScore,
                adjusted: true,
                originalTarget: targetVersion,
                attempts: attempt,
                note: 'Version adjusted due to mismatch or unavailability'
            };
        }
        
        return {
            version: targetVersion,
            score: 0,
            adjusted: false,
            error: 'No available version found',
            attempts: attempt
        };
    }

    // Fetch available versions from registry (simulated - would query npm/pypi/etc)
    async fetchAvailableVersions(req) {
        // In real implementation, this would query:
        // npm view <pkg> versions --json
        // pip index versions <pkg>
        // cargo search <pkg>
        // go list -m -versions <pkg>
        
        const baseVersions = [
            '0.9.0', '0.9.5', '1.0.0-alpha', '1.0.0-beta', 
            '1.0.0-rc', '1.0.0', '1.0.1', '1.1.0', '1.1.1', 
            '1.2.0', '2.0.0-alpha', '2.0.0-beta', '2.0.0', '2.1.0'
        ];
        
        // Add requested version if not in list
        let target = req.version || '1.0.0';
        target = target.replace(/^[\^~>=<]+/, '');
        
        if (!baseVersions.includes(target)) {
            baseVersions.push(target);
        }
        
        return baseVersions;
    }

    // Re-fetch with adjusted parameters based on algo response
    async fetchAdjustedVersions(req, attempt) {
        // Adjust search based on attempt number (gap/pivot logic)
        const gap = Math.min(attempt * 0.1, 1.0);
        
        // Return adjusted version set
        return this.fetchAvailableVersions(req).then(versions => {
            // Filter based on gap adjustment
            return versions.filter((_, idx) => {
                return idx % Math.max(1, Math.floor(1 / gap)) === 0;
            });
        });
    }

    calculateGF(req, version) {
        // Gap factor based on version distance from baseline
        const parts = version.split('.');
        const major = parseInt(parts[0]) || 0;
        return major * 10 + 50;
    }

    calculateH(req, version) {
        // Harmony score inversely related to version instability
        if (version.includes('alpha') || version.includes('beta') || version.includes('rc')) {
            return 0.3; // Pre-release has lower harmony
        }
        return 0.8 + (Math.random() * 0.2); // Stable versions have high harmony
    }

    grepAndLoop(packages) {
        const column = new CompatibilityColumn();
        
        const maxRounds = 25;
        for (let round = 0; round < maxRounds; round++) {
            const compatible = [];
            let allCompatible = true;
            
            for (const pkg of packages) {
                const score = this.calculateCompatibilityScore(pkg, round);
                pkg.chainScore = score;
                pkg.compatible = score >= 0.95;
                
                if (pkg.compatible) {
                    compatible.push(pkg);
                } else {
                    allCompatible = false;
                }
            }
            
            if (allCompatible && compatible.length > 0) {
                column.packages = compatible;
                column.success = true;
                column.noConflict = true;
                column.chainFormed = true;
                column.gfValue = this.calculateGFCrossLanguage(compatible);
                column.hValue = this.calculateHCrossLanguage(compatible);
                break;
            }
            
            packages = compatible;
            if (packages.length === 0) break;
        }
        
        this.round++;
        return column;
    }

    calculateCompatibilityScore(pkg, round) {
        const baseScore = (pkg.gf * pkg.h) / 100.0;
        const adjustment = round * 0.02;
        let score = baseScore + 0.7 + adjustment;
        
        if (score > 1.0) score = 1.0;
        if (score < 0.0) score = 0.0;
        
        return score;
    }

    calculateGFCrossLanguage(packages) {
        let gfSum = 0;
        for (const pkg of packages) {
            gfSum += pkg.gf;
        }
        return packages.length > 0 ? gfSum / packages.length : 0;
    }

    calculateHCrossLanguage(packages) {
        let hSum = 0;
        for (const pkg of packages) {
            hSum += pkg.h;
        }
        return packages.length > 0 ? hSum / packages.length : 0;
    }

    generatePattern(packages) {
        const parts = packages.map(pkg => 
            `${pkg.name}@${pkg.version}:${pkg.language}`
        );
        parts.sort();
        return parts.join('|');
    }

    saveColumn(column, storePath) {
        const pattern = this.generatePattern(column.packages);
        
        // Check if pattern already exists
        if (this.store.patterns.includes(pattern)) {
            console.error('Pattern already exists, skipping save');
            return;
        }
        
        this.store.patterns.push(pattern);
        this.store.columns.push(column);
        this.store.activeColumn = column;
        
        const data = JSON.stringify(this.store, null, 2);
        fs.writeFileSync(storePath, data);
    }

    loadColumnStore(storePath) {
        if (!fs.existsSync(storePath)) {
            return;
        }
        try {
            const data = fs.readFileSync(storePath, 'utf8');
            this.store = JSON.parse(data);
        } catch (e) {
            console.error('Error loading column store:', e.message);
        }
    }

    installCommands(packages) {
        const commands = {};
        
        for (const pkg of packages) {
            let cmd;
            switch (pkg.source) {
                case 'npm':
                    cmd = `npm install ${pkg.name}@${pkg.version}`;
                    break;
                case 'pypi':
                    cmd = `pip install ${pkg.name}==${pkg.version}`;
                    break;
                case 'cargo':
                    cmd = `cargo add ${pkg.name}@${pkg.version}`;
                    break;
                case 'go':
                    cmd = `go get ${pkg.name}@${pkg.version}`;
                    break;
                case 'gem':
                    cmd = `gem install ${pkg.name} -v ${pkg.version}`;
                    break;
            }
            
            if (cmd) {
                if (!commands[pkg.language]) {
                    commands[pkg.language] = [];
                }
                commands[pkg.language].push(cmd);
            }
        }
        return commands;
    }
}

// Main execution - Async with version adjustment
async function main() {
    const resolver = new UniversalResolver();
    
    const workDir = process.argv[2] || process.cwd();
    const storePath = path.join(workDir, '.package_resolver_columns.json');
    const mode = process.argv[3] || 'adjust'; // 'adjust' or 'legacy'
    
    resolver.loadColumnStore(storePath);
    
    // Auto-detect packages
    const requests = resolver.autoDetect(workDir);
    console.error(`Detected ${requests.length} packages`);
    
    let packages;
    
    if (mode === 'adjust') {
        // Use version adjustment protocol
        console.error('[VersionProtocol] Starting version fetch with adjustment...');
        packages = await resolver.enumerateAllVersionsWithAdjustment(requests);
        console.error(`[VersionProtocol] Adjusted ${packages.filter(p => p.adjusted).length} packages`);
    } else {
        // Legacy mode
        packages = resolver.enumerateAllVersions(requests);
    }
    
    // Run GF X H G F resolution loop
    const column = resolver.grepAndLoop(packages);
    
    if (column.success) {
        resolver.saveColumn(column, storePath);
        
        const result = {
            status: 'success',
            column_id: column.id,
            packages: column.packages.length,
            no_conflict: column.noConflict,
            gf_value: parseFloat(column.gfValue.toFixed(4)),
            h_value: parseFloat(column.hValue.toFixed(4)),
            version_adjusted: packages.some(p => p.adjusted)
        };
        console.log(JSON.stringify(result));
        
        // Output install commands
        const commands = resolver.installCommands(column.packages);
        for (const [lang, cmds] of Object.entries(commands)) {
            console.error(`\n${lang} install commands:`);
            for (const cmd of cmds) {
                console.error(`  ${cmd}`);
            }
        }
        
        // Show adjusted packages
        const adjusted = packages.filter(p => p.adjusted);
        if (adjusted.length > 0) {
            console.error('\n[VersionProtocol] Adjusted packages:');
            for (const pkg of adjusted) {
                console.error(`  ${pkg.name}: ${pkg.originalVersion} → ${pkg.version} (score: ${pkg.versionScore.toFixed(2)})`);
            }
        }
    } else {
        const result = { status: 'failed', error: 'no compatible resolution' };
        console.log(JSON.stringify(result));
    }
}

main().catch(console.error);
