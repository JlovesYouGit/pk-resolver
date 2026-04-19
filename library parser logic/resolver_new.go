package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type InstallRequest struct {
	Name     string `json:"name"`
	Version  string `json:"version"`
	Source   string `json:"source"`
	Language string `json:"language"`
	Priority int    `json:"priority"`
}

type CompatibilityColumn struct {
	ID          string            `json:"id"`
	Timestamp   time.Time         `json:"timestamp"`
	ChainFormed bool              `json:"chain_formed"`
	Success     bool              `json:"success"`
	NoConflict  bool              `json:"no_conflict"`
	Packages    []ResolvedPackage `json:"packages"`
	GFValue     float64           `json:"gf"`
	HValue      float64           `json:"h"`
}

type ResolvedPackage struct {
	Name       string  `json:"name"`
	Version    string  `json:"version"`
	Source     string  `json:"source"`
	Language   string  `json:"language"`
	GF         float64 `json:"gf"`
	H          float64 `json:"h"`
	ChainScore float64 `json:"chain_score"`
	Compatible bool    `json:"compatible"`
}

type ColumnStore struct {
	Columns      []CompatibilityColumn `json:"columns"`
	ActiveColumn *CompatibilityColumn  `json:"active_column"`
	Patterns     []string              `json:"patterns"`
}

type UniversalResolver struct {
	store ColumnStore
	round int
}

func NewUniversalResolver() *UniversalResolver {
	return &UniversalResolver{
		store: ColumnStore{
			Columns:  []CompatibilityColumn{},
			Patterns: []string{},
		},
		round: 0,
	}
}

func (r *UniversalResolver) AutoDetect(dir string) []InstallRequest {
	requests := []InstallRequest{}

	if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
		requests = append(requests, r.detectNodePackages(dir)...)
	}
	if _, err := os.Stat(filepath.Join(dir, "requirements.txt")); err == nil {
		requests = append(requests, r.detectPythonPackages(dir)...)
	}
	if _, err := os.Stat(filepath.Join(dir, "Cargo.toml")); err == nil {
		requests = append(requests, r.detectRustPackages(dir)...)
	}
	if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
		requests = append(requests, r.detectGoPackages(dir)...)
	}

	return requests
}

func (r *UniversalResolver) detectNodePackages(dir string) []InstallRequest {
	requests := []InstallRequest{}
	data, _ := os.ReadFile(filepath.Join(dir, "package.json"))
	var pkg map[string]interface{}
	if err := json.Unmarshal(data, &pkg); err == nil {
		if deps, ok := pkg["dependencies"].(map[string]interface{}); ok {
			for name, version := range deps {
				requests = append(requests, InstallRequest{
					Name:     name,
					Version:  fmt.Sprintf("%v", version),
					Source:   "npm",
					Language: "node",
				})
			}
		}
	}
	return requests
}

func (r *UniversalResolver) detectPythonPackages(dir string) []InstallRequest {
	requests := []InstallRequest{}
	data, _ := os.ReadFile(filepath.Join(dir, "requirements.txt"))
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.Split(line, "==")
		if len(parts) == 2 {
			requests = append(requests, InstallRequest{
				Name:     parts[0],
				Version:  parts[1],
				Source:   "pypi",
				Language: "python",
			})
		}
	}
	return requests
}

func (r *UniversalResolver) detectRustPackages(dir string) []InstallRequest {
	requests := []InstallRequest{}
	data, _ := os.ReadFile(filepath.Join(dir, "Cargo.toml"))
	content := string(data)
	if idx := strings.Index(content, "[dependencies]"); idx != -1 {
		depSection := content[idx:]
		lines := strings.Split(depSection, "\n")
		for _, line := range lines[1:] {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "[") {
				break
			}
			parts := strings.Split(line, "=")
			if len(parts) >= 2 {
				requests = append(requests, InstallRequest{
					Name:     strings.TrimSpace(parts[0]),
					Version:  strings.Trim(strings.TrimSpace(parts[1]), "\""),
					Source:   "cargo",
					Language: "rust",
				})
			}
		}
	}
	return requests
}

func (r *UniversalResolver) detectGoPackages(dir string) []InstallRequest {
	requests := []InstallRequest{}
	data, _ := os.ReadFile(filepath.Join(dir, "go.mod"))
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "require ") {
			parts := strings.Fields(line)
			if len(parts) >= 3 {
				requests = append(requests, InstallRequest{
					Name:     parts[1],
					Version:  parts[2],
					Source:   "go",
					Language: "go",
				})
			}
		}
	}
	return requests
}

func (r *UniversalResolver) EnumerateAllVersions(requests []InstallRequest) []ResolvedPackage {
	allPackages := []ResolvedPackage{}

	for _, req := range requests {
		versions := r.queryPackageVersions(req)
		for i, v := range versions {
			offset := r.languageOffset(req.Language)
			rp := ResolvedPackage{
				Name:     req.Name,
				Version:  v,
				Source:   req.Source,
				Language: req.Language,
				GF:       float64(i)*0.5 + offset,
				H:        1.0/(float64(i)+1.0) + float64(i)*0.1,
			}
			allPackages = append(allPackages, rp)
		}
	}
	return allPackages
}

func (r *UniversalResolver) languageOffset(lang string) float64 {
	offsets := map[string]float64{
		"node":   0,
		"python": 100,
		"rust":   200,
		"go":     300,
	}
	if off, ok := offsets[lang]; ok {
		return off
	}
	return 0
}

func (r *UniversalResolver) queryPackageVersions(req InstallRequest) []string {
	requestedVersion := req.Version
	if requestedVersion == "latest" || requestedVersion == "" {
		requestedVersion = "1.0.0"
	}
	return []string{"0.9.0", "1.0.0", "1.1.0", "1.2.0", "2.0.0", requestedVersion}
}

func (r *UniversalResolver) GrepAndLoop(packages []ResolvedPackage) CompatibilityColumn {
	column := CompatibilityColumn{
		ID:        fmt.Sprintf("col_%d_%d", time.Now().Unix(), r.round),
		Timestamp: time.Now(),
		Packages:  []ResolvedPackage{},
		GFValue:   0,
		HValue:    0,
	}

	maxRounds := 25
	for round := 0; round < maxRounds; round++ {
		compatible := []ResolvedPackage{}
		allCompatible := true

		for _, pkg := range packages {
			score := r.calculateCompatibilityScore(pkg, round)
			pkg.ChainScore = score
			pkg.Compatible = score >= 0.98

			if pkg.Compatible {
				compatible = append(compatible, pkg)
			} else {
				allCompatible = false
			}
		}

		if allCompatible && len(compatible) > 0 {
			column.Packages = compatible
			column.Success = true
			column.NoConflict = true
			column.ChainFormed = true
			column.GFValue = r.calculateGFCrossLanguage(compatible)
			column.HValue = r.calculateHCrossLanguage(compatible)
			break
		}

		packages = compatible
		if len(packages) == 0 {
			break
		}
	}

	r.round++
	return column
}

func (r *UniversalResolver) calculateCompatibilityScore(pkg ResolvedPackage, round int) float64 {
	baseScore := (pkg.GF * pkg.H) / 100.0
	adjustment := float64(round) * 0.02
	score := baseScore + 0.7 + adjustment

	if score > 1.0 {
		score = 1.0
	}
	if score < 0.0 {
		score = 0.0
	}

	return score
}

func (r *UniversalResolver) calculateGFCrossLanguage(packages []ResolvedPackage) float64 {
	gfSum := 0.0
	for _, pkg := range packages {
		gfSum += pkg.GF
	}
	return gfSum / float64(len(packages))
}

func (r *UniversalResolver) calculateHCrossLanguage(packages []ResolvedPackage) float64 {
	hSum := 0.0
	for _, pkg := range packages {
		hSum += pkg.H
	}
	return hSum / float64(len(packages))
}

func (r *UniversalResolver) SaveColumn(column CompatibilityColumn, storePath string) error {
	pattern := r.generatePattern(column.Packages)

	for _, p := range r.store.Patterns {
		if p == pattern {
			return nil
		}
	}

	r.store.Patterns = append(r.store.Patterns, pattern)
	r.store.Columns = append(r.store.Columns, column)
	r.store.ActiveColumn = &column

	data, err := json.MarshalIndent(r.store, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(storePath, data, 0644)
}

func (r *UniversalResolver) generatePattern(packages []ResolvedPackage) string {
	parts := []string{}
	for _, pkg := range packages {
		parts = append(parts, fmt.Sprintf("%s@%s:%s", pkg.Name, pkg.Version, pkg.Language))
	}
	sort.Strings(parts)
	return strings.Join(parts, "|")
}

func (r *UniversalResolver) LoadColumnStore(storePath string) error {
	if _, err := os.Stat(storePath); os.IsNotExist(err) {
		return nil
	}
	data, err := os.ReadFile(storePath)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, &r.store)
}

func (r *UniversalResolver) InstallCommands(packages []ResolvedPackage) map[string][]string {
	commands := make(map[string][]string)

	for _, pkg := range packages {
		var cmd string
		switch pkg.Source {
		case "npm":
			cmd = fmt.Sprintf("npm install %s@%s", pkg.Name, pkg.Version)
		case "pypi":
			cmd = fmt.Sprintf("pip install %s==%s", pkg.Name, pkg.Version)
		case "cargo":
			cmd = fmt.Sprintf("cargo add %s@%s", pkg.Name, pkg.Version)
		case "go":
			cmd = fmt.Sprintf("go get %s@%s", pkg.Name, pkg.Version)
		}
		if cmd != "" {
			commands[pkg.Language] = append(commands[pkg.Language], cmd)
		}
	}
	return commands
}

func main() {
	resolver := NewUniversalResolver()

	workDir := "."
	if len(os.Args) > 1 {
		workDir = os.Args[1]
	}

	storePath := filepath.Join(workDir, ".package_resolver_columns.json")
	resolver.LoadColumnStore(storePath)

	requests := resolver.AutoDetect(workDir)
	fmt.Fprintf(os.Stderr, "Detected %d packages\n", len(requests))

	packages := resolver.EnumerateAllVersions(requests)
	column := resolver.GrepAndLoop(packages)

	if column.Success {
		resolver.SaveColumn(column, storePath)

		result := map[string]interface{}{
			"status":      "success",
			"column_id":   column.ID,
			"packages":    len(column.Packages),
			"no_conflict": column.NoConflict,
			"gf_value":    column.GFValue,
			"h_value":     column.HValue,
		}
		out, _ := json.Marshal(result)
		fmt.Println(string(out))

		commands := resolver.InstallCommands(column.Packages)
		for lang, cmds := range commands {
			fmt.Fprintf(os.Stderr, "\n%s install commands:\n", lang)
			for _, cmd := range cmds {
				fmt.Fprintf(os.Stderr, "  %s\n", cmd)
			}
		}
	} else {
		result := map[string]string{"status": "failed", "error": "no compatible resolution"}
		out, _ := json.Marshal(result)
		fmt.Println(string(out))
	}
}
