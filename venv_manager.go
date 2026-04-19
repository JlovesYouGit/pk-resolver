package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

type VenvConfig struct {
	Name        string   `json:"name"`
	PythonPath  string   `json:"python_path"`
	Packages    []string `json:"packages"`
	VenvPath    string   `json:"venv_path"`
	Status      string   `json:"status"`
}

type NodeStatus struct {
	NodeName    string      `json:"node_name"`
	Active      bool        `json:"active"`
	VenvConfig  VenvConfig  `json:"venv_config"`
	PID         int         `json:"pid"`
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintf(os.Stderr, "Usage: %s <config.json>\n", os.Args[0])
		os.Exit(1)
	}

	configPath := os.Args[1]
	
	// Read JSON config
	data, err := os.ReadFile(configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error reading config: %v\n", err)
		os.Exit(1)
	}

	var config VenvConfig
	if err := json.Unmarshal(data, &config); err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing config: %v\n", err)
		os.Exit(1)
	}

	// Set node as active
	status := NodeStatus{
		NodeName:   config.Name,
		Active:     true,
		VenvConfig: config,
		PID:        os.Getpid(),
	}

	// Output status as JSON for Node.js to read
	statusJSON, _ := json.Marshal(status)
	fmt.Println(string(statusJSON))

	// Setup Python virtual environment
	if err := setupVenv(config); err != nil {
		fmt.Fprintf(os.Stderr, "Error setting up venv: %v\n", err)
		os.Exit(1)
	}

	// Keep process running to maintain subprocess relationship
	select {}
}

func setupVenv(config VenvConfig) error {
	venvPath := config.VenvPath
	if venvPath == "" {
		venvPath = filepath.Join(".", config.Name+"_venv")
	}

	// Check if venv already exists
	if _, err := os.Stat(venvPath); os.IsNotExist(err) {
		fmt.Fprintf(os.Stderr, "Creating virtual environment at %s...\n", venvPath)
		
		python := config.PythonPath
		if python == "" {
			python = "python3"
		}

		cmd := exec.Command(python, "-m", "venv", venvPath)
		cmd.Stdout = os.Stderr
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("failed to create venv: %w", err)
		}
	}

	// Install packages
	pipPath := filepath.Join(venvPath, "bin", "pip")
	if _, err := os.Stat(pipPath); err != nil {
		pipPath = filepath.Join(venvPath, "Scripts", "pip.exe")
	}

	for _, pkg := range config.Packages {
		fmt.Fprintf(os.Stderr, "Installing package: %s...\n", pkg)
		cmd := exec.Command(pipPath, "install", pkg)
		cmd.Stdout = os.Stderr
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("failed to install %s: %w", pkg, err)
		}
	}

	fmt.Fprintf(os.Stderr, "Virtual environment ready at %s\n", venvPath)
	return nil
}
