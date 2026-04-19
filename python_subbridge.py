#!/usr/bin/env python3
"""
Python SubBridge - Controlled by Node.js Central Orchestrator
Treats all packages as part of unified Python environment
Reports back to Node via stdout
"""

import sys
import json
import subprocess
import os
import re
from typing import Dict, List, Optional
from dataclasses import dataclass

@dataclass
class UnifiedPackage:
    """Package representation in unified Python environment"""
    name: str
    version: str
    language: str
    source: str
    unified_id: str
    python_equivalent: str
    virtual_path: str
    installed: bool = False

class PythonEnvironmentBridge:
    """
    Bridge that makes all packages appear as Python packages
    even if they're from npm, cargo, or go
    """
    
    def __init__(self, work_dir: str, nodepack_dir: str):
        self.work_dir = work_dir
        self.nodepack_dir = nodepack_dir
        self.venv_path = os.path.join(work_dir, 'unified_venv')
        self.packages: List[UnifiedPackage] = []
        self.running = True
        
    def initialize(self):
        """Initialize Python subprocess bridge"""
        # Ensure virtual environment exists
        self._ensure_venv()
        
        # Send ready signal to Node
        self._send_message({
            'type': 'bridge_ready',
            'message': '[PYTHON_BRIDGE_READY]',
            'venv_path': self.venv_path,
            'pid': os.getpid()
        })
        
    def _ensure_venv(self):
        """Create unified virtual environment if not exists"""
        if not os.path.exists(self.venv_path):
            try:
                subprocess.run(
                    ['python3', '-m', 'venv', self.venv_path],
                    check=True,
                    capture_output=True
                )
                self._send_message({
                    'type': 'venv_created',
                    'path': self.venv_path
                })
            except subprocess.CalledProcessError as e:
                self._send_message({
                    'type': 'error',
                    'message': f'Failed to create venv: {e}'
                })
    
    def _ensure_venv_constraint(self) -> bool:
        """
        CONSTRAINT: Virtual environment must exist before installation
        Auto-applies venv setup when install command runs
        Returns True if venv is ready, False otherwise
        """
        if os.path.exists(self.venv_path):
            # Verify venv is valid
            pip_path = os.path.join(self.venv_path, 'bin', 'pip')
            if os.path.exists(pip_path):
                return True
        
        # Auto-create venv
        self._send_message({
            'type': 'constraint_applying',
            'constraint': 'venv_required',
            'action': 'auto_creating_venv',
            'path': self.venv_path
        })
        
        try:
            result = subprocess.run(
                ['python3', '-m', 'venv', self.venv_path, '--system-site-packages'],
                check=True,
                capture_output=True,
                text=True,
                timeout=120
            )
            
            # Verify pip is available
            pip_path = os.path.join(self.venv_path, 'bin', 'pip')
            if os.path.exists(pip_path):
                self._send_message({
                    'type': 'constraint_satisfied',
                    'constraint': 'venv_required',
                    'venv_path': self.venv_path,
                    'message': 'Virtual environment created and ready - packages will be safely contained'
                })
                return True
            else:
                self._send_message({
                    'type': 'constraint_failed',
                    'constraint': 'venv_required',
                    'error': 'Venv created but pip not found'
                })
                return False
                
        except subprocess.TimeoutExpired:
            self._send_message({
                'type': 'constraint_failed',
                'constraint': 'venv_required',
                'error': 'Venv creation timed out'
            })
            return False
        except subprocess.CalledProcessError as e:
            self._send_message({
                'type': 'constraint_failed',
                'constraint': 'venv_required',
                'error': f'Venv creation failed: {e.stderr}'
            })
            return False
    
    def _send_message(self, msg: Dict):
        """Send JSON message to Node.js parent"""
        print(json.dumps(msg), flush=True)
    
    def _read_message(self) -> Optional[Dict]:
        """Read JSON message from Node.js parent"""
        try:
            line = sys.stdin.readline().strip()
            if line:
                return json.loads(line)
        except json.JSONDecodeError:
            pass
        return None
    
    def detect_all_packages(self) -> List[UnifiedPackage]:
        """
        Detect packages from all languages and unify them
        as Python packages
        """
        packages = []
        
        # Detect Python packages (native)
        py_packages = self._detect_python_packages()
        for pkg in py_packages:
            packages.append(UnifiedPackage(
                name=pkg['name'],
                version=pkg['version'],
                language='python',
                source=pkg.get('source', 'pip'),
                unified_id=f"python:{pkg['name']}@{pkg['version']}",
                python_equivalent=pkg['name'],
                virtual_path=os.path.join(self.venv_path, 'lib', pkg['name'])
            ))
        
        # Detect Node packages and convert to unified view
        node_packages = self._detect_node_packages()
        for pkg in node_packages:
            py_equiv = self._get_python_equivalent(pkg['name'])
            packages.append(UnifiedPackage(
                name=pkg['name'],
                version=pkg['version'],
                language='node',
                source='npm',
                unified_id=f"node:{pkg['name']}@{pkg['version']}",
                python_equivalent=py_equiv,
                virtual_path=os.path.join(self.work_dir, 'node_modules', '.unified', pkg['name'])
            ))
        
        # Detect Rust packages
        rust_packages = self._detect_rust_packages()
        for pkg in rust_packages:
            py_equiv = self._get_python_equivalent(pkg['name'])
            packages.append(UnifiedPackage(
                name=pkg['name'],
                version=pkg['version'],
                language='rust',
                source='cargo',
                unified_id=f"rust:{pkg['name']}@{pkg['version']}",
                python_equivalent=py_equiv,
                virtual_path=os.path.join(self.work_dir, 'target', '.unified', pkg['name'])
            ))
        
        # Detect Go packages
        go_packages = self._detect_go_packages()
        for pkg in go_packages:
            py_equiv = self._get_python_equivalent(pkg['name'])
            packages.append(UnifiedPackage(
                name=pkg['name'],
                version=pkg['version'],
                language='go',
                source='go',
                unified_id=f"go:{pkg['name']}@{pkg['version']}",
                python_equivalent=py_equiv,
                virtual_path=os.path.join(self.work_dir, 'vendor', '.unified', pkg['name'])
            ))
        
        self.packages = packages
        return packages
    
    def _detect_python_packages(self) -> List[Dict]:
        """Detect Python packages via pip list"""
        packages = []
        try:
            result = subprocess.run(
                [os.path.join(self.venv_path, 'bin', 'python'), '-m', 'pip', 'list', '--format=json'],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                data = json.loads(result.stdout)
                for pkg in data:
                    packages.append({
                        'name': pkg['name'],
                        'version': pkg['version'],
                        'source': 'pip'
                    })
        except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError):
            # Fallback to pip freeze
            try:
                result = subprocess.run(
                    ['pip', 'freeze'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                for line in result.stdout.strip().split('\n'):
                    match = re.match(r'^([a-zA-Z0-9_-]+)==(.+)$', line)
                    if match:
                        packages.append({
                            'name': match.group(1),
                            'version': match.group(2),
                            'source': 'pip'
                        })
            except:
                pass
        return packages
    
    def _detect_node_packages(self) -> List[Dict]:
        """Detect Node.js packages from package.json"""
        packages = []
        package_json = os.path.join(self.work_dir, 'package.json')
        
        if os.path.exists(package_json):
            try:
                with open(package_json, 'r') as f:
                    data = json.load(f)
                    deps = {**data.get('dependencies', {}), **data.get('devDependencies', {})}
                    for name, version in deps.items():
                        # Clean version string
                        version = re.sub(r'^[\^~>=<]+', '', version)
                        packages.append({'name': name, 'version': version})
            except:
                pass
        return packages
    
    def _detect_rust_packages(self) -> List[Dict]:
        """Detect Rust packages from Cargo.toml"""
        packages = []
        cargo_toml = os.path.join(self.work_dir, 'Cargo.toml')
        
        if os.path.exists(cargo_toml):
            try:
                with open(cargo_toml, 'r') as f:
                    content = f.read()
                    # Simple parsing for [dependencies] section
                    in_deps = False
                    for line in content.split('\n'):
                        if line.strip() == '[dependencies]':
                            in_deps = True
                            continue
                        if in_deps and line.strip().startswith('['):
                            break
                        if in_deps and '=' in line:
                            parts = line.split('=')
                            if len(parts) >= 2:
                                name = parts[0].strip()
                                version = parts[1].strip().strip('"').strip("'")
                                packages.append({'name': name, 'version': version})
            except:
                pass
        return packages
    
    def _detect_go_packages(self) -> List[Dict]:
        """Detect Go packages from go.mod"""
        packages = []
        go_mod = os.path.join(self.work_dir, 'go.mod')
        
        if os.path.exists(go_mod):
            try:
                with open(go_mod, 'r') as f:
                    content = f.read()
                    # Parse require statements
                    for match in re.finditer(r'require\s+\(?\s*([^)]+)\)?', content):
                        deps = match.group(1)
                        for line in deps.split('\n'):
                            parts = line.strip().split()
                            if len(parts) >= 2:
                                packages.append({
                                    'name': parts[0],
                                    'version': parts[1]
                                })
            except:
                pass
        return packages
    
    def _get_python_equivalent(self, package_name: str) -> str:
        """Get Python equivalent name for non-Python packages"""
        equivalents = {
            'lodash': 'pydash',
            'axios': 'requests',
            'express': 'flask',
            'react': 'reflex',
            'next': 'fastapi',
            'vue': 'pywebio',
            'typescript': 'mypy',
            'jest': 'pytest',
            'tokio': 'asyncio',
            'serde': 'dataclasses',
            'gin': 'flask',
            'echo': 'tornado'
        }
        return equivalents.get(package_name, f'py-{package_name}')
    
    def install_as_python(self, pkg: UnifiedPackage) -> bool:
        """
        Install a package treating it as Python package
        CONSTRAINT: Auto-apply venv setup before installation
        All packages are safely contained in the unified virtual environment
        """
        # CONSTRAINT: Ensure venv exists before any installation
        if not self._ensure_venv_constraint():
            self._send_message({
                'type': 'error',
                'message': 'Failed to create virtual environment - cannot install safely'
            })
            return False
        
        if pkg.language == 'python':
            # Direct Python installation
            try:
                result = subprocess.run(
                    [os.path.join(self.venv_path, 'bin', 'pip'), 'install', f"{pkg.name}=={pkg.version}"],
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                pkg.installed = result.returncode == 0
                return pkg.installed
            except:
                return False
        else:
            # Install Python equivalent
            try:
                result = subprocess.run(
                    [os.path.join(self.venv_path, 'bin', 'pip'), 'install', pkg.python_equivalent],
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                pkg.installed = result.returncode == 0
                return pkg.installed
            except:
                return False
    
    def create_unified_view(self):
        """Create a view where all packages appear as Python packages"""
        unified = {
            'type': 'unified_view',
            'packages': [],
            'venv_path': self.venv_path,
            'cross_language_map': {}
        }
        
        for pkg in self.packages:
            unified['packages'].append({
                'unified_id': pkg.unified_id,
                'name': pkg.name,
                'version': pkg.version,
                'language': pkg.language,
                'python_name': pkg.python_equivalent,
                'virtual_path': pkg.virtual_path,
                'installed': pkg.installed
            })
            
            # Build cross-language map
            if pkg.python_equivalent not in unified['cross_language_map']:
                unified['cross_language_map'][pkg.python_equivalent] = []
            unified['cross_language_map'][pkg.python_equivalent].append(pkg.unified_id)
        
        return unified
    
    def handle_command(self, msg: Dict):
        """Handle command from Node.js parent"""
        cmd = msg.get('command')
        data = msg.get('data', {})
        
        if cmd == 'install':
            pkg = UnifiedPackage(
                name=data.get('name', ''),
                version=data.get('version', ''),
                language=data.get('language', ''),
                source=data.get('source', ''),
                unified_id=data.get('unifiedId', ''),
                python_equivalent=data.get('pythonEquivalent', ''),
                virtual_path=data.get('virtualPath', '')
            )
            success = self.install_as_python(pkg)
            self._send_message({
                'type': 'install_complete',
                'package': pkg.unified_id,
                'success': success,
                'python_equivalent': pkg.python_equivalent
            })
            
        elif cmd == 'list_packages':
            packages = self.detect_all_packages()
            self._send_message({
                'type': 'packages_detected',
                'count': len(packages),
                'packages': [{
                    'unifiedId': p.unified_id,
                    'name': p.name,
                    'version': p.version,
                    'language': p.language,
                    'pythonEquivalent': p.python_equivalent
                } for p in packages]
            })
            
        elif cmd == 'unified_view':
            view = self.create_unified_view()
            self._send_message(view)
            
        elif cmd == 'stop':
            self.running = False
            self._send_message({'type': 'stopping', 'pid': os.getpid()})
    
    def run(self):
        """Main loop - listen for commands from Node"""
        self.initialize()
        
        while self.running:
            try:
                msg = self._read_message()
                if msg:
                    self.handle_command(msg)
            except KeyboardInterrupt:
                break
            except Exception as e:
                self._send_message({
                    'type': 'error',
                    'message': str(e)
                })
        
        print('[Python] SubBridge shutting down', file=sys.stderr)

def main():
    if len(sys.argv) < 3:
        print("Usage: python_subbridge.py <work_dir> <nodepack_dir>", file=sys.stderr)
        sys.exit(1)
    
    work_dir = sys.argv[1]
    nodepack_dir = sys.argv[2]
    
    bridge = PythonEnvironmentBridge(work_dir, nodepack_dir)
    bridge.run()

if __name__ == '__main__':
    main()
