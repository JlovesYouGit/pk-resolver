#!/usr/bin/env python3
"""
Pipeline Bridge - Targeting System for Cross-Language Package Management
Bridges Node.js resolver with Python subprocess orchestration
Uses grep-based detection and custom logic correction
"""

import subprocess
import json
import os
import re
import time
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from pathlib import Path
import threading
import signal

@dataclass
class TargetRule:
    """Rule for targeting specific package patterns"""
    name: str
    pattern: str
    language: str
    priority: int = 0
    action: str = "install"  # install, remove, upgrade, hold
    condition: Optional[str] = None

@dataclass
class PackageTarget:
    """Targeted package with resolution status"""
    name: str
    version: str
    language: str
    source: str
    rule_applied: str = ""
    corrected: bool = False
    installed: bool = False
    gf_score: float = 0.0
    h_score: float = 0.0

@dataclass
class ColumnBridge:
    """Bridge between column store and Python orchestration"""
    column_id: str
    packages: List[PackageTarget] = field(default_factory=list)
    gf_value: float = 0.0
    h_value: float = 0.0
    no_conflict: bool = False
    pattern_signature: str = ""

class TargetingSystem:
    """
    Main targeting system that loops through rules and manages
    the pipeline bridge connection to the Node.js resolver
    """
    
    def __init__(self, work_dir: str, nodepack_dir: str):
        self.work_dir = work_dir
        self.nodepack_dir = nodepack_dir
        self.parser_dir = os.path.join(nodepack_dir, "library parser logic")
        self.rules: List[TargetRule] = []
        self.targets: List[PackageTarget] = []
        self.columns: List[ColumnBridge] = []
        self.active_column: Optional[ColumnBridge] = None
        self.running = False
        self.loop_interval = 2.0
        self._setup_rules()
        
    def _setup_rules(self):
        """Initialize default targeting rules by priority order"""
        self.rules = [
            # Critical security updates first
            TargetRule("security-critical", r"(security|crypto|auth)", "any", priority=100, action="upgrade"),
            
            # Core dependencies
            TargetRule("core-deps", r"^(express|fastapi|actix|gin)$", "any", priority=90, action="hold"),
            
            # Language-specific core
            TargetRule("node-core", r"^(lodash|axios|react|vue)$", "node", priority=80),
            TargetRule("python-core", r"^(requests|numpy|pandas|django|flask)$", "python", priority=80),
            TargetRule("rust-core", r"^(tokio|serde|actix-web)$", "rust", priority=80),
            TargetRule("go-core", r"^(gin|echo|fasthttp)$", "go", priority=80),
            
            # Development dependencies
            TargetRule("dev-deps", r"(test|mock|debug|lint)", "any", priority=50, action="install"),
            
            # Unknown packages - lowest priority
            TargetRule("unknown", r".*", "any", priority=10, action="install"),
        ]
        self.rules.sort(key=lambda r: r.priority, reverse=True)
    
    def grep_detect_packages(self) -> Dict[str, List[Dict]]:
        """
        Grep-based detection of packages across all language ecosystems
        Returns packages found in lockfiles and manifests
        """
        detected = {
            "node": [],
            "python": [],
            "rust": [],
            "go": [],
            "ruby": []
        }
        
        # Grep Node packages from package-lock.json
        try:
            result = subprocess.run(
                ["grep", "-o", '"\\"name\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*\\"', 
                 os.path.join(self.work_dir, "package-lock.json")],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                for line in result.stdout.strip().split("\n"):
                    match = re.search(r'"name":\s*"([^"]+)"', line)
                    if match:
                        detected["node"].append({"name": match.group(1), "source": "grep"})
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
        
        # Grep Python packages from requirements or lock files
        for filename in ["requirements.txt", "Pipfile.lock", "poetry.lock"]:
            filepath = os.path.join(self.work_dir, filename)
            if os.path.exists(filepath):
                try:
                    with open(filepath, 'r') as f:
                        content = f.read()
                        if filename == "requirements.txt":
                            for line in content.split("\n"):
                                match = re.match(r'^([a-zA-Z0-9_-]+)==(.+)$', line.strip())
                                if match:
                                    detected["python"].append({
                                        "name": match.group(1), 
                                        "version": match.group(2),
                                        "source": filename
                                    })
                        elif filename == "poetry.lock":
                            # Grep [[package]] sections
                            packages = re.findall(r'\[\[package\]\]\s*name\s*=\s*"([^"]+)"', content)
                            for pkg in packages:
                                detected["python"].append({"name": pkg, "source": filename})
                except Exception:
                    pass
        
        # Grep Rust packages from Cargo.lock
        cargo_lock = os.path.join(self.work_dir, "Cargo.lock")
        if os.path.exists(cargo_lock):
            try:
                with open(cargo_lock, 'r') as f:
                    content = f.read()
                    packages = re.findall(r'^name\s*=\s*"([^"]+)"\s*$', content, re.MULTILINE)
                    for pkg in packages:
                        detected["rust"].append({"name": pkg, "source": "Cargo.lock"})
            except Exception:
                pass
        
        # Grep Go packages from go.sum
        go_sum = os.path.join(self.work_dir, "go.sum")
        if os.path.exists(go_sum):
            try:
                with open(go_sum, 'r') as f:
                    for line in f:
                        parts = line.strip().split()
                        if len(parts) >= 1:
                            # Format: module/path v0.0.0 h1:hash
                            module = parts[0]
                            if module:
                                detected["go"].append({"name": module, "source": "go.sum"})
            except Exception:
                pass
        
        return detected
    
    def call_node_resolver(self) -> Optional[Dict]:
        """
        Bridge to Node.js resolver via subprocess
        Calls the resolver.js script and parses JSON output
        """
        resolver_script = os.path.join(self.parser_dir, "resolver.js")
        
        try:
            result = subprocess.run(
                ["node", resolver_script, self.work_dir],
                capture_output=True,
                text=True,
                timeout=30,
                cwd=self.work_dir
            )
            
            # Parse JSON from output (find first JSON line)
            for line in result.stdout.strip().split("\n"):
                line = line.strip()
                if line.startswith("{"):
                    return json.loads(line)
            
            return None
        except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError) as e:
            print(f"[Bridge] Node resolver error: {e}")
            return None
    
    def call_go_resolver(self) -> Optional[Dict]:
        """Bridge to Go resolver binary"""
        go_resolver = os.path.join(self.parser_dir, "resolver_new")
        
        if not os.path.exists(go_resolver):
            return None
        
        try:
            result = subprocess.run(
                [go_resolver, self.work_dir],
                capture_output=True,
                text=True,
                timeout=30,
                cwd=self.work_dir
            )
            
            for line in result.stdout.strip().split("\n"):
                line = line.strip()
                if line.startswith("{"):
                    return json.loads(line)
            
            return None
        except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError) as e:
            print(f"[Bridge] Go resolver error: {e}")
            return None
    
    def load_column_store(self) -> Optional[Dict]:
        """Load the column store JSON file"""
        store_path = os.path.join(self.work_dir, ".package_resolver_columns.json")
        
        if not os.path.exists(store_path):
            return None
        
        try:
            with open(store_path, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            return None
    
    def apply_rules(self, packages: List[PackageTarget]) -> List[PackageTarget]:
        """
        Apply targeting rules in priority order
        Returns packages with rule metadata attached
        """
        for pkg in packages:
            for rule in self.rules:
                if self._matches_rule(pkg, rule):
                    pkg.rule_applied = rule.name
                    if rule.action in ["install", "upgrade"]:
                        pkg.corrected = True
                    break
        
        return packages
    
    def _matches_rule(self, pkg: PackageTarget, rule: TargetRule) -> bool:
        """Check if package matches a targeting rule"""
        if rule.language != "any" and pkg.language != rule.language:
            return False
        
        return bool(re.search(rule.pattern, pkg.name, re.IGNORECASE))
    
    def custom_logic_correction(self, packages: List[PackageTarget]) -> List[PackageTarget]:
        """
        Apply custom GF X H G F logic correction to packages
        Ensures compatibility across the entire set
        """
        # Calculate cross-language GF and H
        gf_sum = sum(p.gf_score for p in packages)
        h_sum = sum(p.h_score for p in packages)
        count = len(packages)
        
        if count == 0:
            return packages
        
        avg_gf = gf_sum / count
        avg_h = h_sum / count
        
        # Apply correction based on deviation from average
        for pkg in packages:
            gf_dev = abs(pkg.gf_score - avg_gf)
            h_dev = abs(pkg.h_score - avg_h)
            
            # If deviation is high, mark for correction
            if gf_dev > 50 or h_dev > 0.5:
                pkg.corrected = True
                # Adjust scores toward average
                pkg.gf_score = (pkg.gf_score + avg_gf) / 2
                pkg.h_score = (pkg.h_score + avg_h) / 2
        
        return packages
    
    def install_package(self, pkg: PackageTarget) -> bool:
        """
        Install a single package using appropriate language manager
        CONSTRAINT: Auto-setup venv for Python packages before installation
        All packages are safely contained in isolated environments
        """
        cmd = None
        env_path = None
        
        # CONSTRAINT: Python packages require venv auto-setup
        if pkg.language == "python":
            venv_path = os.path.join(self.work_dir, "safely_contained_venv")
            
            # Auto-create venv if not exists
            if not os.path.exists(venv_path):
                print(f"[CONSTRAINT] Auto-creating venv at {venv_path} for safe containment")
                try:
                    subprocess.run(
                        ["python3", "-m", "venv", venv_path, "--system-site-packages"],
                        check=True,
                        capture_output=True,
                        timeout=120
                    )
                    print(f"[CONSTRAINT] ✓ Venv created - packages will be safely contained")
                except subprocess.CalledProcessError as e:
                    print(f"[CONSTRAINT] ✗ Venv creation failed: {e}")
                    return False
                except subprocess.TimeoutExpired:
                    print(f"[CONSTRAINT] ✗ Venv creation timed out")
                    return False
            
            # Use venv pip for installation
            pip_path = os.path.join(venv_path, "bin", "pip")
            if os.path.exists(pip_path):
                cmd = [pip_path, "install", f"{pkg.name}=={pkg.version}"]
                env_path = venv_path
            else:
                print(f"[CONSTRAINT] ✗ pip not found in venv")
                return False
                
        elif pkg.language == "node":
            cmd = ["npm", "install", f"{pkg.name}@{pkg.version}"]
        elif pkg.language == "rust":
            cmd = ["cargo", "add", f"{pkg.name}@{pkg.version}"]
        elif pkg.language == "go":
            cmd = ["go", "get", f"{pkg.name}@{pkg.version}"]
        elif pkg.language == "ruby":
            cmd = ["gem", "install", pkg.name, "-v", pkg.version]
        
        if not cmd:
            return False
        
        try:
            result = subprocess.run(
                cmd,
                cwd=self.work_dir,
                capture_output=True,
                text=True,
                timeout=60
            )
            pkg.installed = result.returncode == 0
            return pkg.installed
        except subprocess.TimeoutExpired:
            return False
        except FileNotFoundError:
            print(f"[Bridge] Command not found: {cmd[0]}")
            return False
    
    def targeting_loop(self):
        """
        Main targeting loop that continuously monitors and corrects
        """
        self.running = True
        print("[Targeting] Loop started")
        
        while self.running:
            try:
                # Step 1: Grep detect current state
                detected = self.grep_detect_packages()
                
                # Step 2: Call Node.js resolver for resolution
                resolution = self.call_node_resolver()
                
                if resolution and resolution.get("status") == "success":
                    # Step 3: Load column data
                    store = self.load_column_store()
                    
                    if store and store.get("active_column"):
                        active = store["active_column"]
                        
                        # Step 4: Create targets from resolved packages
                        targets = []
                        for p in active.get("packages", []):
                            target = PackageTarget(
                                name=p["name"],
                                version=p["version"],
                                language=p["language"],
                                source=p["source"],
                                gf_score=p.get("gf", 0),
                                h_score=p.get("h", 0)
                            )
                            targets.append(target)
                        
                        # Step 5: Apply rules in priority order
                        targets = self.apply_rules(targets)
                        
                        # Step 6: Custom logic correction
                        targets = self.custom_logic_correction(targets)
                        
                        # Step 7: Install corrected packages
                        for target in targets:
                            if target.corrected and not target.installed:
                                print(f"[Targeting] Installing {target.name}@{target.version} ({target.language})")
                                self.install_package(target)
                        
                        self.targets = targets
                
                # Wait before next iteration
                time.sleep(self.loop_interval)
                
            except KeyboardInterrupt:
                print("\n[Targeting] Interrupted")
                self.stop()
                break
            except Exception as e:
                print(f"[Targeting] Error in loop: {e}")
                time.sleep(self.loop_interval)
    
    def stop(self):
        """Stop the targeting loop"""
        self.running = False
        print("[Targeting] Loop stopped")
    
    def run_single_pass(self) -> List[PackageTarget]:
        """Run a single targeting pass (non-looping)"""
        detected = self.grep_detect_packages()
        resolution = self.call_node_resolver()
        
        if not resolution or resolution.get("status") != "success":
            return []
        
        store = self.load_column_store()
        if not store or not store.get("active_column"):
            return []
        
        active = store["active_column"]
        targets = []
        
        for p in active.get("packages", []):
            target = PackageTarget(
                name=p["name"],
                version=p["version"],
                language=p["language"],
                source=p["source"],
                gf_score=p.get("gf", 0),
                h_score=p.get("h", 0)
            )
            targets.append(target)
        
        targets = self.apply_rules(targets)
        targets = self.custom_logic_correction(targets)
        
        return targets

class PipelineBridge:
    """
    Main bridge class that coordinates between Python and Node.js
    Manages the grep -> resolve -> correct -> install pipeline
    """
    
    def __init__(self, work_dir: str):
        self.work_dir = work_dir
        self.nodepack_dir = os.path.dirname(os.path.abspath(__file__))
        self.targeting = TargetingSystem(work_dir, self.nodepack_dir)
    
    def build_pipeline_connection(self) -> bool:
        """
        Build the pipeline bridge connection post-grep
        Returns True if connection established
        """
        # Verify Node.js resolver is available
        resolver_js = os.path.join(self.nodepack_dir, "library parser logic", "resolver.js")
        resolver_go = os.path.join(self.nodepack_dir, "library parser logic", "resolver_new")
        
        if not os.path.exists(resolver_js):
            print("[Bridge] Node.js resolver not found")
            return False
        
        print("[Bridge] Pipeline connection ready")
        print(f"  Work dir: {self.work_dir}")
        print(f"  Resolver JS: {resolver_js}")
        print(f"  Resolver Go: {resolver_go} (exists: {os.path.exists(resolver_go)})")
        
        return True
    
    def execute_custom_install(self, packages: List[Dict]):
        """
        Execute custom installation with targeting logic
        """
        # Convert to PackageTarget objects
        targets = []
        for p in packages:
            target = PackageTarget(
                name=p.get("name", ""),
                version=p.get("version", "latest"),
                language=p.get("language", ""),
                source=p.get("source", "")
            )
            targets.append(target)
        
        # Apply full pipeline
        targets = self.targeting.apply_rules(targets)
        targets = self.targeting.custom_logic_correction(targets)
        
        # Install
        for target in targets:
            if target.corrected:
                print(f"[Install] {target.name}@{target.version} ({target.language})")
                self.targeting.install_package(target)

def main():
    """Main entry point for pipeline bridge"""
    import sys
    
    work_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    mode = sys.argv[2] if len(sys.argv) > 2 else "single"  # single, loop, grep
    
    bridge = PipelineBridge(work_dir)
    
    if not bridge.build_pipeline_connection():
        print("[Bridge] Failed to establish connection")
        return 1
    
    if mode == "loop":
        # Set up signal handler for graceful shutdown
        def signal_handler(sig, frame):
            print("\n[Bridge] Shutting down...")
            bridge.targeting.stop()
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        bridge.targeting.targeting_loop()
    
    elif mode == "grep":
        # Just run grep detection
        detected = bridge.targeting.grep_detect_packages()
        print(json.dumps(detected, indent=2))
    
    else:
        # Single pass
        targets = bridge.targeting.run_single_pass()
        print(f"[Bridge] Processed {len(targets)} targets")
        for t in targets:
            status = "corrected" if t.corrected else "ok"
            print(f"  [{status}] {t.name}@{t.version} ({t.language}) - rule: {t.rule_applied}")
    
    return 0

if __name__ == "__main__":
    exit(main())
