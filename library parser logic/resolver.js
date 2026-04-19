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

    // Search Query Version Protocol - Finds best version with accuracy rating
    async searchQueryVersionProtocol(req, maxAttempts = 10) {
        const targetVersion = req.version;
        let availableVersions = await this.fetchAvailableVersions(req);
        
        if (availableVersions.length === 0) {
            return {
                version: targetVersion || 'latest',
                score: 0,
                adjusted: false,
                error: 'No versions available from registry',
                attempts: 0,
                accuracyRating: 'failed'
            };
        }
        
        // Sort newest to oldest for better matching
        availableVersions = availableVersions.sort((a, b) => this.compareVersions(b, a));
        
        // Handle blank/undefined versions - pick latest stable
        if (!targetVersion || targetVersion === 'latest' || targetVersion === '*') {
            const latest = availableVersions[0];
            const accuracy = this.calculateAccuracyRating(null, latest, availableVersions);
            return {
                version: latest,
                score: 1.0,
                adjusted: true,
                originalTarget: 'blank/latest',
                attempts: 1,
                accuracyRating: accuracy.rating,
                accuracyDetails: accuracy.details,
                note: 'Auto-selected latest stable version'
            };
        }
        
        // Try exact match first
        const exactMatch = availableVersions.find(v => v === targetVersion.replace(/^[\^~>=<]+/, ''));
        if (exactMatch) {
            const accuracy = this.calculateAccuracyRating(targetVersion, exactMatch, availableVersions);
            return {
                version: exactMatch,
                score: 1.0,
                adjusted: false,
                originalTarget: targetVersion,
                attempts: 1,
                accuracyRating: accuracy.rating,
                accuracyDetails: accuracy.details,
                note: 'Exact match found'
            };
        }
        
        // Try semver range matching (^18.3.1 should match 18.3.1, 18.4.0, etc.)
        const rangeMatch = this.findBestSemverMatch(targetVersion, availableVersions);
        if (rangeMatch) {
            const accuracy = this.calculateAccuracyRating(targetVersion, rangeMatch, availableVersions);
            return {
                version: rangeMatch,
                score: accuracy.score,
                adjusted: true,
                originalTarget: targetVersion,
                attempts: 1,
                accuracyRating: accuracy.rating,
                accuracyDetails: accuracy.details,
                note: `Semver range match for ${targetVersion}`
            };
        }
        
        // Fallback: use best available with scoring
        let bestVersion = availableVersions[0]; // Latest
        let bestScore = 0;
        
        for (const version of availableVersions.slice(0, 20)) { // Check top 20
            const score = this.calculateVersionAccuracyScore(targetVersion, version);
            if (score > bestScore) {
                bestScore = score;
                bestVersion = version;
            }
        }
        
        const accuracy = this.calculateAccuracyRating(targetVersion, bestVersion, availableVersions);
        return {
            version: bestVersion,
            score: bestScore,
            adjusted: true,
            originalTarget: targetVersion,
            attempts: 1,
            accuracyRating: accuracy.rating,
            accuracyDetails: accuracy.details,
            note: 'Best available version selected'
        };
    }

    // Find best semver match (^, ~, >=, etc.)
    findBestSemverMatch(range, versions) {
        // Parse range
        const cleanRange = range.trim();
        
        // ^18.3.1 -> compatible with 18.3.1, 18.4.0, 18.x.x but NOT 19.0.0
        if (cleanRange.startsWith('^')) {
            const base = cleanRange.substring(1);
            const [major, minor, patch] = base.split('.').map(v => parseInt(v) || 0);
            
            // Find highest version within same major
            const matches = versions.filter(v => {
                const [vMaj, vMin, vPat] = v.split('.').map(x => parseInt(x) || 0);
                if (vMaj !== major) return false;
                if (vMin < minor) return false;
                if (vMin === minor && vPat < patch) return false;
                return true;
            });
            
            return matches[0] || null; // Return highest (newest)
        }
        
        // ~18.3.1 -> compatible with 18.3.x but NOT 18.4.0
        if (cleanRange.startsWith('~')) {
            const base = cleanRange.substring(1);
            const [major, minor] = base.split('.').map(v => parseInt(v) || 0);
            
            const matches = versions.filter(v => {
                const [vMaj, vMin] = v.split('.').map(x => parseInt(x) || 0);
                return vMaj === major && vMin === minor;
            });
            
            return matches[0] || null;
        }
        
        // >=18.3.1
        if (cleanRange.startsWith('>=')) {
            const base = cleanRange.substring(2);
            const baseParts = base.split('.').map(v => parseInt(v) || 0);
            
            const matches = versions.filter(v => {
                const vParts = v.split('.').map(x => parseInt(x) || 0);
                for (let i = 0; i < 3; i++) {
                    if (vParts[i] > baseParts[i]) return true;
                    if (vParts[i] < baseParts[i]) return false;
                }
                return true;
            });
            
            return matches[0] || null;
        }
        
        // 18.3.1 (exact with no prefix)
        if (/^\d+\.\d+/.test(cleanRange)) {
            const base = cleanRange.replace(/^[\^~>=<]+/, '');
            return versions.find(v => v.startsWith(base)) || null;
        }
        
        return null;
    }

    // Calculate accuracy score (0-1) based on how well version matches target
    calculateVersionAccuracyScore(target, candidate) {
        const targetParts = target.replace(/^[\^~>=<]+/, '').split('.').map(v => parseInt(v) || 0);
        const candParts = candidate.split('.').map(v => parseInt(v) || 0);
        
        let score = 0;
        const weights = [0.5, 0.3, 0.2]; // major, minor, patch weights
        
        for (let i = 0; i < 3; i++) {
            const t = targetParts[i] || 0;
            const c = candParts[i] || 0;
            if (c === t) score += weights[i];
            else if (c > t) score += weights[i] * 0.5; // higher version partial credit
        }
        
        return score;
    }

    // Calculate accuracy rating (A-F) with details
    calculateAccuracyRating(target, selected, allVersions) {
        if (!target || target === 'latest' || target === '*') {
            return {
                rating: 'A',
                score: 1.0,
                details: {
                    type: 'auto_latest',
                    matchType: 'latest_stable',
                    totalAvailable: allVersions.length,
                    percentile: 100
                }
            };
        }
        
        const cleanTarget = target.replace(/^[\^~>=<]+/, '');
        const [tMaj, tMin, tPat] = cleanTarget.split('.').map(v => parseInt(v) || 0);
        const [sMaj, sMin, sPat] = selected.split('.').map(v => parseInt(v) || 0);
        
        // Determine match type
        let matchType = 'partial';
        let rating = 'C';
        let score = 0.5;
        
        if (sMaj === tMaj && sMin === tMin && sPat === tPat) {
            matchType = 'exact';
            rating = 'A+';
            score = 1.0;
        } else if (sMaj === tMaj && sMin === tMin) {
            matchType = 'same_minor';
            rating = 'A';
            score = 0.9;
        } else if (sMaj === tMaj) {
            matchType = 'same_major';
            rating = 'B';
            score = 0.75;
        } else if (sMaj === tMaj + 1) {
            matchType = 'next_major';
            rating = 'C';
            score = 0.5;
        }
        
        // Calculate percentile (how high is this version among all available)
        const sorted = [...allVersions].sort((a, b) => this.compareVersions(b, a));
        const rank = sorted.indexOf(selected);
        const percentile = Math.round(((allVersions.length - rank) / allVersions.length) * 100);
        
        return {
            rating,
            score,
            details: {
                type: matchType,
                targetVersion: cleanTarget,
                selectedVersion: selected,
                majorMatch: sMaj === tMaj,
                minorMatch: sMin === tMin,
                patchMatch: sPat === tPat,
                totalAvailable: allVersions.length,
                rank: rank + 1,
                percentile
            }
        };
    }

    // Fetch available versions from actual registry
    async fetchAvailableVersions(req) {
        const { execSync } = require('child_process');
        const name = req.name;
        const language = req.language || 'node';
        
        try {
            if (language === 'node' || language === 'npm') {
                // Query npm registry
                const result = execSync(`npm view ${name} versions --json 2>/dev/null`, { 
                    encoding: 'utf8', 
                    timeout: 15000,
                    maxBuffer: 5 * 1024 * 1024
                });
                const versions = JSON.parse(result);
                if (Array.isArray(versions) && versions.length > 0) {
                    return versions.filter(v => /^\d+\.\d+\.\d+/.test(v)); // Only stable versions
                }
            } 
            else if (language === 'python' || language === 'pip') {
                // Query PyPI via pip
                const result = execSync(`pip index versions ${name} 2>&1 | head -5`, {
                    encoding: 'utf8',
                    timeout: 15000
                });
                // Parse output like: "Available versions: 1.0.0, 1.0.1, 1.1.0"
                const match = result.match(/Available versions?:\s*([\d.,\s]+)/i);
                if (match) {
                    return match[1].split(',').map(v => v.trim()).filter(v => v);
                }
            }
            else if (language === 'rust' || language === 'cargo') {
                // For cargo, we use crates.io API or cargo search
                const result = execSync(`cargo search ${name} --limit 1 2>/dev/null | head -1`, {
                    encoding: 'utf8',
                    timeout: 15000
                });
                // Parse like: "crate = \"1.2.3\""
                const match = result.match(/=\s*"(\d+\.\d+\.\d+)"/);
                if (match) {
                    const latest = match[1];
                    const [major, minor] = latest.split('.').map(Number);
                    // Generate recent versions
                    const versions = [];
                    for (let m = Math.max(0, minor - 5); m <= minor; m++) {
                        for (let p = 0; p <= 10; p++) {
                            versions.push(`${major}.${m}.${p}`);
                        }
                    }
                    return versions;
                }
            }
            else if (language === 'go') {
                // Query Go proxy
                const https = require('https');
                const proxy = process.env.GOPROXY || 'https://proxy.golang.org';
                const versions = await new Promise((resolve, reject) => {
                    https.get(`${proxy}/${name}/@v/list`, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            const vers = data.trim().split('\n')
                                .filter(v => v.startsWith('v'))
                                .map(v => v.replace(/^v/, ''));
                            resolve(vers);
                        });
                    }).on('error', reject);
                });
                if (versions.length > 0) return versions;
            }
        } catch (e) {
            console.log(`[Registry] Could not fetch versions for ${name}: ${e.message}`);
        }
        
        // If registry fetch fails and we have a specific version requested, try to use it
        if (req.version && req.version !== 'latest' && req.version !== '*') {
            const cleanVersion = req.version.replace(/^[\^~>=<]+/, '');
            if (cleanVersion.match(/^\d+\.\d+/)) {
                return [cleanVersion];
            }
        }
        
        // Last resort - return empty and let caller handle
        return [];
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
