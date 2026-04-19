#!/usr/bin/env node
/**
 * Predictive PID Layer - Terminal Process Monitor
 * Targets active terminal PID and feeds to predictive analytics
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const os = require('os');
const execAsync = util.promisify(exec);

class TerminalProcessMonitor {
    constructor() {
        this.activePids = new Map();
        this.predictiveData = [];
        this.sessionId = `session_${Date.now()}`;
    }

    // Get active terminal process PID
    async getActiveTerminalPid() {
        const platform = os.platform();
        
        try {
            if (platform === 'darwin') {
                // macOS - get foreground terminal process
                const { stdout } = await execAsync(
                    "lsof -i -P | grep LISTEN | head -1 | awk '{print $2}' || echo ''"
                );
                const pid = stdout.trim();
                if (pid) return parseInt(pid, 10);
                
                // Alternative: get shell processes
                const { stdout: shellOut } = await execAsync(
                    "ps -o pid,ppid,comm | grep -E '(zsh|bash|fish)' | head -1 | awk '{print $1}'"
                );
                return parseInt(shellOut.trim(), 10) || process.pid;
                
            } else if (platform === 'linux') {
                // Linux - get terminal leader
                const { stdout } = await execAsync(
                    "ps -o pid,sid,comm | grep -E '(bash|zsh|fish)' | head -1 | awk '{print $1}'"
                );
                return parseInt(stdout.trim(), 10) || process.pid;
                
            } else {
                // Windows - use current process
                return process.pid;
            }
        } catch (e) {
            console.error('[PIDMonitor] Error getting terminal PID:', e.message);
            return process.pid;
        }
    }

    // Get all related process tree
    async getProcessTree(parentPid) {
        const platform = os.platform();
        const tree = {
            root: parentPid,
            children: [],
            timestamp: Date.now()
        };
        
        try {
            if (platform === 'darwin' || platform === 'linux') {
                const { stdout } = await execAsync(
                    `ps -o pid,ppid,comm | grep '${parentPid}' | awk '{print $1, $3}'`
                );
                
                for (const line of stdout.trim().split('\n')) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 2) {
                        tree.children.push({
                            pid: parseInt(parts[0], 10),
                            command: parts[1],
                            parent: parentPid
                        });
                    }
                }
            }
        } catch (e) {
            console.error('[PIDMonitor] Error getting process tree:', e.message);
        }
        
        return tree;
    }

    // Collect terminal log data for package error detection
    async collectTerminalLogs(pid) {
        const logs = {
            pid: pid,
            timestamp: Date.now(),
            errors: [],
            mismatches: [],
            packageIssues: []
        };
        
        try {
            // Check for npm log files
            const npmLogPath = path.join(process.env.HOME || '', '.npm', '_logs');
            if (fs.existsSync(npmLogPath)) {
                const recentLogs = await this.readRecentLogs(npmLogPath, 5);
                const npmErrors = this.parsePackageErrors(recentLogs, 'npm');
                logs.errors.push(...npmErrors);
            }
            
            // Check for local package installation errors
            const localLogs = [
                path.join(process.cwd(), 'npm-debug.log'),
                path.join(process.cwd(), 'yarn-error.log'),
                path.join(process.cwd(), 'pip.log'),
                path.join(process.cwd(), 'cargo.log')
            ];
            
            for (const logPath of localLogs) {
                if (fs.existsSync(logPath)) {
                    const content = fs.readFileSync(logPath, 'utf8');
                    const errors = this.parsePackageErrors(content, this.detectLogType(logPath));
                    logs.errors.push(...errors);
                }
            }
            
            // Get terminal output if available (via process stdout capture)
            const terminalOutput = await this.captureTerminalOutput(pid);
            const terminalErrors = this.parsePackageErrors(terminalOutput, 'terminal');
            logs.errors.push(...terminalErrors);
            
            // Categorize errors
            logs.mismatches = logs.errors.filter(e => 
                e.type === 'version_mismatch' || 
                e.type === 'dependency_conflict' ||
                e.type === 'incompatible_version'
            );
            
            logs.packageIssues = logs.errors.filter(e => 
                e.type === 'missing_package' ||
                e.type === 'install_failed' ||
                e.type === 'resolution_failed'
            );
            
        } catch (e) {
            // Log collection may fail silently
        }
        
        return logs;
    }

    async readRecentLogs(logDir, count = 5) {
        try {
            const files = fs.readdirSync(logDir)
                .filter(f => f.endsWith('.log'))
                .map(f => ({ name: f, path: path.join(logDir, f), mtime: fs.statSync(path.join(logDir, f)).mtime }))
                .sort((a, b) => b.mtime - a.mtime)
                .slice(0, count);
            
            let content = '';
            for (const file of files) {
                content += fs.readFileSync(file.path, 'utf8') + '\n';
            }
            return content;
        } catch (e) {
            return '';
        }
    }

    detectLogType(logPath) {
        if (logPath.includes('npm')) return 'npm';
        if (logPath.includes('yarn')) return 'yarn';
        if (logPath.includes('pip')) return 'pip';
        if (logPath.includes('cargo')) return 'cargo';
        if (logPath.includes('go')) return 'go';
        return 'unknown';
    }

    async captureTerminalOutput(pid) {
        // Try to capture recent terminal output (limited support)
        try {
            // On macOS/Linux, check if we can read from tty
            const tty = process.env.TTY || '/dev/tty';
            if (fs.existsSync(tty)) {
                // Cannot directly read from active tty without permission
                return '';
            }
        } catch (e) {}
        return '';
    }

    parsePackageErrors(logContent, source) {
        const errors = [];
        const lines = logContent.split('\n');
        
        // NPM error patterns
        const npmPatterns = [
            { regex: /npm ERR!\s+.*could not resolve.*dependency.*'(\S+)'.*'(\S+)'/i, type: 'version_mismatch', extract: m => ({ package: m[1], required: m[2] }) },
            { regex: /npm ERR!\s+.*conflict.*'(\S+)'.*'(\S+)'/i, type: 'dependency_conflict', extract: m => ({ package: m[1], conflict: m[2] }) },
            { regex: /npm ERR!\s+.*no matching version.*'(\S+)'/i, type: 'incompatible_version', extract: m => ({ package: m[1] }) },
            { regex: /npm ERR!\s+.*package not found.*'(\S+)'/i, type: 'missing_package', extract: m => ({ package: m[1] }) },
            { regex: /npm ERR!\s+.*install failed/i, type: 'install_failed', extract: () => ({}) }
        ];
        
        // PIP error patterns
        const pipPatterns = [
            { regex: /Could not find a version.*\(from versions:.*\).*for\s+(\S+)/i, type: 'incompatible_version', extract: m => ({ package: m[1] }) },
            { regex: /ERROR:.*No matching distribution.*for\s+(\S+)/i, type: 'missing_package', extract: m => ({ package: m[1] }) },
            { regex: /pip.*requires.*(>=?|<|==).*but you have.*which is incompatible/i, type: 'version_mismatch', extract: () => ({}) },
            { regex: /conflicting dependencies.*'(\S+)'/i, type: 'dependency_conflict', extract: m => ({ package: m[1] }) }
        ];
        
        // Cargo error patterns
        const cargoPatterns = [
            { regex: /failed to select a version for.*'(\S+)'/i, type: 'version_mismatch', extract: m => ({ package: m[1] }) },
            { regex: /conflicting requirements.*'(\S+)'/i, type: 'dependency_conflict', extract: m => ({ package: m[1] }) },
            { regex: /no matching package.*'(\S+)'/i, type: 'missing_package', extract: m => ({ package: m[1] }) }
        ];
        
        // Go error patterns
        const goPatterns = [
            { regex: /go:.*requires.*(>=?|<|==).*but.*has/i, type: 'version_mismatch', extract: () => ({}) },
            { regex: /go:.*no matching versions for\s+(\S+)/i, type: 'incompatible_version', extract: m => ({ package: m[1] }) },
            { regex: /go:.*cannot find module.*'(\S+)'/i, type: 'missing_package', extract: m => ({ package: m[1] }) }
        ];
        
        // Universal patterns
        const universalPatterns = [
            { regex: /version.*mismatch.*expected.*'(\S+)'.*found.*'(\S+)'/i, type: 'version_mismatch', extract: m => ({ expected: m[1], found: m[2] }) },
            { regex: /dependency.*conflict.*'(\S+)'/i, type: 'dependency_conflict', extract: m => ({ package: m[1] }) },
            { regex: /incompatible.*version.*'(\S+)'/i, type: 'incompatible_version', extract: m => ({ package: m[1] }) }
        ];
        
        const patterns = [...npmPatterns, ...pipPatterns, ...cargoPatterns, ...goPatterns, ...universalPatterns];
        
        for (const line of lines) {
            for (const pattern of patterns) {
                const match = line.match(pattern.regex);
                if (match) {
                    const error = {
                        source: source,
                        type: pattern.type,
                        message: line.trim(),
                        timestamp: Date.now(),
                        details: pattern.extract(match)
                    };
                    errors.push(error);
                }
            }
        }
        
        return errors;
    }
}

class PredictiveLayer {
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.pidHistory = [];
        this.predictions = new Map();
        this.model = {
            patterns: [],
            thresholds: {
                cpuHigh: 80,
                memoryHigh: 70,
                timeLimit: 3600000 // 1 hour
            }
        };
    }

    // Feed package error log data to predictive layer
    feed(logData) {
        this.pidHistory.push({
            ...logData,
            timestamp: Date.now()
        });
        
        // Keep only last 100 entries
        if (this.pidHistory.length > 100) {
            this.pidHistory.shift();
        }
        
        // Generate prediction based on package errors
        const prediction = this.generatePackageErrorPrediction(logData);
        this.predictions.set(logData.pid || 'terminal', prediction);
        
        return prediction;
    }

    generatePackageErrorPrediction(logData) {
        const history = this.pidHistory.filter(h => h.pid === logData.pid);
        
        // Analyze current errors
        const mismatches = logData.mismatches || [];
        const packageIssues = logData.packageIssues || [];
        const allErrors = logData.errors || [];
        
        // Build issues list from package errors only
        const issues = [];
        
        // Process version mismatches
        for (const mismatch of mismatches) {
            issues.push({
                type: mismatch.type,
                severity: this.calculateMismatchSeverity(mismatch),
                package: mismatch.details?.package || 'unknown',
                message: mismatch.message,
                source: mismatch.source
            });
        }
        
        // Process package issues
        for (const issue of packageIssues) {
            issues.push({
                type: issue.type,
                severity: 'warning',
                package: issue.details?.package || 'unknown',
                message: issue.message,
                source: issue.source
            });
        }
        
        // Calculate error trend
        const errorTrend = this.calculateErrorTrend(history);
        
        // Determine outcome based on package errors
        let outcome = 'stable';
        const criticalTypes = ['version_mismatch', 'dependency_conflict', 'incompatible_version'];
        
        if (issues.some(i => criticalTypes.includes(i.type) && i.severity === 'critical')) {
            outcome = 'critical';
        } else if (issues.length > 0) {
            outcome = 'needs_attention';
        }
        
        // Increase severity if errors are increasing
        if (errorTrend > 0 && outcome === 'stable') {
            outcome = 'needs_attention';
        }
        
        return {
            pid: logData.pid,
            timestamp: Date.now(),
            outcome: outcome,
            confidence: Math.min(allErrors.length > 0 ? 1.0 : 0.3, 1.0),
            issues: issues,
            errorCount: allErrors.length,
            mismatchCount: mismatches.length,
            packageIssueCount: packageIssues.length,
            errorTrend: errorTrend,
            recommendation: this.generatePackageRecommendation(outcome, issues, errorTrend),
            affectedPackages: [...new Set(issues.map(i => i.package))]
        };
    }

    calculateMismatchSeverity(mismatch) {
        // Determine severity based on mismatch type and context
        if (mismatch.type === 'version_mismatch') return 'critical';
        if (mismatch.type === 'dependency_conflict') return 'critical';
        if (mismatch.type === 'incompatible_version') return 'warning';
        return 'info';
    }

    calculateErrorTrend(history) {
        if (history.length < 2) return 0;
        
        // Count errors in recent history
        const recent = history.slice(-5);
        const errorCounts = recent.map(h => (h.errors || []).length);
        
        // Simple trend: increasing if last > first
        if (errorCounts.length >= 2) {
            return errorCounts[errorCounts.length - 1] - errorCounts[0];
        }
        return 0;
    }

    generatePackageRecommendation(outcome, issues, errorTrend) {
        const mismatchIssues = issues.filter(i => 
            ['version_mismatch', 'dependency_conflict', 'incompatible_version'].includes(i.type)
        );
        
        if (outcome === 'stable') return 'no_action_needed';
        
        if (mismatchIssues.length > 0) {
            const packages = [...new Set(mismatchIssues.map(i => i.package))].join(', ');
            return `resolve_version_conflicts:${packages}`;
        }
        
        if (errorTrend > 0) {
            return 'investigate_install_failures';
        }
        
        return 'review_package_configuration';
    }

    getPredictions() {
        return Array.from(this.predictions.values());
    }

    exportModel() {
        return {
            sessionId: this.sessionId,
            patternCount: this.model.patterns.length,
            predictionCount: this.predictions.size,
            latestPredictions: this.getPredictions().slice(-10)
        };
    }
}

class PIDToPredictiveBridge {
    constructor(workDir) {
        this.workDir = workDir;
        this.monitor = new TerminalProcessMonitor();
        this.predictiveLayer = null;
        this.activePid = null;
        this.running = false;
        this.interval = 2000; // 2 seconds
    }

    async initialize() {
        console.log('[PIDPredictive] Initializing bridge...');
        
        // Get active terminal PID
        this.activePid = await this.monitor.getActiveTerminalPid();
        console.log(`[PIDPredictive] Active terminal PID: ${this.activePid}`);
        
        // Initialize predictive layer with session
        this.predictiveLayer = new PredictiveLayer(this.monitor.sessionId);
        
        // Get process tree
        const tree = await this.monitor.getProcessTree(this.activePid);
        console.log(`[PIDPredictive] Process tree: ${tree.children.length} children`);
        
        return true;
    }

    async feedLoop() {
        this.running = true;
        console.log('[PIDPredictive] Starting package error monitoring...');
        
        while (this.running) {
            try {
                // Collect terminal logs for package error detection
                const logs = await this.monitor.collectTerminalLogs(this.activePid);
                
                // Feed to predictive layer only if there are errors
                if (logs.errors.length > 0 || logs.mismatches.length > 0) {
                    const prediction = this.predictiveLayer.feed(logs);
                    
                    // Output prediction
                    if (prediction.outcome !== 'stable') {
                        console.log(`[PIDPredictive] Package errors detected: ${prediction.outcome} (${prediction.confidence.toFixed(2)})`);
                        console.log(`  Total errors: ${prediction.errorCount}, Mismatches: ${prediction.mismatchCount}`);
                        
                        if (prediction.issues.length > 0) {
                            for (const issue of prediction.issues.slice(0, 3)) {
                                console.log(`  - [${issue.severity}] ${issue.type}: ${issue.package}`);
                            }
                        }
                        console.log(`  Recommendation: ${prediction.recommendation}`);
                        
                        if (prediction.affectedPackages.length > 0) {
                            console.log(`  Affected: ${prediction.affectedPackages.join(', ')}`);
                        }
                    }
                }
                
                await new Promise(r => setTimeout(r, this.interval));
            } catch (e) {
                console.error('[PIDPredictive] Feed error:', e.message);
            }
        }
    }

    stop() {
        this.running = false;
        const exportData = this.predictiveLayer.exportModel();
        
        // Save to file
        const exportPath = path.join(this.workDir, '.pid_predictions.json');
        fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
        
        console.log('[PIDPredictive] Stopped. Predictions saved to', exportPath);
    }

    getStatus() {
        return {
            active: this.running,
            pid: this.activePid,
            predictions: this.predictiveLayer ? this.predictiveLayer.getPredictions().length : 0
        };
    }
}

// Integration with existing resolver system
class ResolverPIDIntegration {
    constructor(workDir, nodepackDir) {
        this.workDir = workDir;
        this.nodepackDir = nodepackDir;
        this.pidBridge = new PIDToPredictiveBridge(workDir);
        this.resolverProcess = null;
    }

    async start() {
        console.log('[ResolverPID] Starting integrated system...');
        
        // Initialize PID monitoring
        await this.pidBridge.initialize();
        
        // Start PID feed loop in background
        const pidLoop = this.pidBridge.feedLoop();
        
        // Start resolver process
        await this.startResolver();
        
        return { pidLoop, resolver: this.resolverProcess };
    }

    async startResolver() {
        const resolverPath = path.join(this.nodepackDir, 'library parser logic', 'resolver.js');
        
        return new Promise((resolve) => {
            this.resolverProcess = spawn('node', [resolverPath, this.workDir, 'adjust'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.resolverProcess.stdout.on('data', (data) => {
                const msg = data.toString().trim();
                if (msg.startsWith('{')) {
                    try {
                        const result = JSON.parse(msg);
                        console.log('[Resolver]', result);
                    } catch (e) {
                        console.log('[Resolver]', msg);
                    }
                }
            });

            this.resolverProcess.stderr.on('data', (data) => {
                console.log('[Resolver]', data.toString().trim());
            });

            this.resolverProcess.on('close', (code) => {
                console.log(`[Resolver] Exited with code ${code}`);
                this.pidBridge.stop();
                resolve(code);
            });
        });
    }

    stop() {
        this.pidBridge.stop();
        if (this.resolverProcess) {
            this.resolverProcess.kill();
        }
    }
}

// Main entry
async function main() {
    const workDir = process.argv[2] || process.cwd();
    const mode = process.argv[3] || 'standalone'; // 'standalone' or 'integrated'
    const nodepackDir = path.dirname(__filename);

    if (mode === 'integrated') {
        const integration = new ResolverPIDIntegration(workDir, nodepackDir);
        
        process.on('SIGINT', () => {
            console.log('\nShutting down...');
            integration.stop();
            process.exit(0);
        });

        await integration.start();
    } else {
        // Standalone PID monitoring
        const bridge = new PIDToPredictiveBridge(workDir);
        await bridge.initialize();
        
        process.on('SIGINT', () => {
            console.log('\nShutting down...');
            bridge.stop();
            process.exit(0);
        });

        await bridge.feedLoop();
    }
}

main().catch(console.error);

module.exports = { TerminalProcessMonitor, PredictiveLayer, PIDToPredictiveBridge, ResolverPIDIntegration };
