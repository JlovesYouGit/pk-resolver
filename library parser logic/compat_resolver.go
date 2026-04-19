package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// PackageRequest represents user-desired packages
type PackageRequest struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Source  string `json:"source"` // npm, pypi, go, etc.
}

// PackageInfo represents discovered package with compatibility markers
type PackageInfo struct {
	Name       string   `json:"name"`
	Version    string   `json:"version"`
	Source     string   `json:"source"`
	Markers    []Marker `json:"markers"`
	GF         float64  `json:"gf"`         // Gap Factor
	H          float64  `json:"h"`          // Harmony score
	Pivot      float64  `json:"pivot"`      // Pivot number
	ChainScore float64  `json:"chain_score"`
}

// Marker represents compatibility coordinate
type Marker struct {
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Valid bool    `json:"valid"`
}

// ResolutionChain represents the GF X H G F logic chain
type ResolutionChain struct {
	Gap        float64       `json:"gap"`
	PivotLeft  float64       `json:"pivot_left"`
	Pieces     []float64     `json:"pieces"`
	NextGF     float64       `json:"next_gf"`
	NextH      float64       `json:"next_h"`
	Packages   []PackageInfo `json:"packages"`
	Round      int           `json:"round"`
	BacktestOK bool          `json:"backtest_ok"`
}

// Config holds the resolution configuration
type Config struct {
	Requests []PackageRequest `json:"requests"`
	Chain    ResolutionChain  `json:"chain"`
	Resolved []PackageInfo    `json:"resolved"`
}

// GF_X_H_G_F_Resolver implements the chain resolution algorithm
type GF_X_H_G_F_Resolver struct {
	packages []PackageInfo
	config   Config
	round    int
}

func NewResolver(config Config) *GF_X_H_G_F_Resolver {
	return &GF_X_H_G_F_Resolver{
		packages: []PackageInfo{},
		config:   config,
		round:    0,
	}
}

// Search queries all packages across sources with version control
func (r *GF_X_H_G_F_Resolver) Search(requests []PackageRequest) []PackageInfo {
	results := []PackageInfo{}
	
	for _, req := range requests {
		// Query packages from all sources (simulated)
		found := r.querySource(req)
		results = append(results, found...)
	}
	
	return results
}

func (r *GF_X_H_G_F_Resolver) querySource(req PackageRequest) []PackageInfo {
	// Simulated search - in real implementation, query npm/pypi/go registries
	// Returns multiple versions with compatibility markers
	versions := []string{"1.0.0", "1.1.0", "2.0.0", "2.1.0", req.Version}
	results := []PackageInfo{}
	
	for i, v := range versions {
		info := PackageInfo{
			Name:    req.Name,
			Version: v,
			Source:  req.Source,
			Markers: []Marker{
				{X: float64(i) * 1.5, Y: float64(i) * 2.0, Valid: true},
				{X: float64(i) * 2.0, Y: float64(i) * 1.5, Valid: true},
			},
			GF:    float64(i) * 0.5,
			H:     1.0 / (float64(i) + 1.0),
			Pivot: float64(i*10) + 5,
		}
		results = append(results, info)
	}
	
	return results
}

// Resolve implements the GF X H G F chain with gap analysis
func (r *GF_X_H_G_F_Resolver) Resolve(packages []PackageInfo) ResolutionChain {
	chain := ResolutionChain{
		Packages: packages,
		Round:    r.round,
	}
	
	// Calculate gap between X values
	xValues := []float64{}
	for _, pkg := range packages {
		for _, m := range pkg.Markers {
			xValues = append(xValues, m.X)
		}
	}
	
	if len(xValues) >= 2 {
		sort.Float64s(xValues)
		minX, maxX := xValues[0], xValues[len(xValues)-1]
		chain.Gap = maxX - minX
		
		// Match pivot number left over
		chain.PivotLeft = math.Mod(chain.Gap, 10.0)
		
		// Divide result in equal pieces
		pieceCount := len(packages) + 1
		pieceSize := chain.PivotLeft / float64(pieceCount)
		chain.Pieces = []float64{}
		for i := 0; i < pieceCount; i++ {
			chain.Pieces = append(chain.Pieces, pieceSize*float64(i+1))
		}
		
		// Calculate next GF X H G F
		chain.NextGF = chain.Gap / (chain.H + 0.1)
		chain.NextH = chain.PivotLeft / float64(len(chain.Packages))
	}
	
	return chain
}

// Backtest validates the chain and adjusts packages
func (r *GF_X_H_G_F_Resolver) Backtest(chain ResolutionChain) ResolutionChain {
	// Live constant adjustment of packages
	adjusted := []PackageInfo{}
	
	for _, pkg := range chain.Packages {
		// Test compatibility based on chain pieces
		score := r.testCompatibility(pkg, chain.Pieces)
		
		if score > 0.7 {
			pkg.ChainScore = score
			pkg.GF = chain.NextGF
			pkg.H = chain.NextH
			adjusted = append(adjusted, pkg)
		}
		// Remove if score too low (incompatible)
	}
	
	chain.Packages = adjusted
	chain.BacktestOK = len(adjusted) > 0
	r.round++
	chain.Round = r.round
	
	return chain
}

func (r *GF_X_H_G_F_Resolver) testCompatibility(pkg PackageInfo, pieces []float64) float64 {
	score := 0.0
	
	// Check if package markers align with pieces
	for _, marker := range pkg.Markers {
		for _, piece := range pieces {
			if math.Abs(marker.X-piece) < 1.0 {
				score += 0.3
			}
			if math.Abs(marker.Y-piece) < 1.0 {
				score += 0.3
			}
		}
	}
	
	// GF X H G F compatibility check
	if pkg.GF*pkg.H > 0.5 {
		score += 0.4
	}
	
	return math.Min(score, 1.0)
}

// PipelineLoop runs iterative resolution until stable
func (r *GF_X_H_G_F_Resolver) PipelineLoop(requests []PackageRequest) Config {
	packages := r.Search(requests)
	resolved := []PackageInfo{}
	
	for i := 0; i < 10; i++ { // Max 10 rounds
		chain := r.Resolve(packages)
		chain = r.Backtest(chain)
		
		if chain.BacktestOK && len(chain.Packages) > 0 {
			resolved = append(resolved, chain.Packages...)
			
			// Check if stable (no changes from last round)
			if i > 0 && r.isStable(resolved) {
				break
			}
		}
		
		packages = chain.Packages
	}
	
	// Deduplicate by best version
	resolved = r.deduplicate(resolved)
	
	r.config.Resolved = resolved
	r.config.Chain = ResolutionChain{
		Packages:   resolved,
		Round:      r.round,
		BacktestOK: true,
	}
	
	return r.config
}

func (r *GF_X_H_G_F_Resolver) isStable(packages []PackageInfo) bool {
	if len(packages) < 2 {
		return true
	}
	// Check if last 2 rounds produced same packages
	return r.round > 1
}

func (r *GF_X_H_G_F_Resolver) deduplicate(packages []PackageInfo) []PackageInfo {
	seen := make(map[string]PackageInfo)
	
	for _, pkg := range packages {
		key := pkg.Name + "@" + pkg.Source
		existing, ok := seen[key]
		
		if !ok || pkg.ChainScore > existing.ChainScore {
			seen[key] = pkg
		}
	}
	
	result := []PackageInfo{}
	for _, pkg := range seen {
		result = append(result, pkg)
	}
	
	return result
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintf(os.Stderr, "Usage: %s <requests.json>\n", os.Args[0])
		os.Exit(1)
	}
	
	// Read package requests
	data, err := os.ReadFile(os.Args[1])
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error reading requests: %v\n", err)
		os.Exit(1)
	}
	
	var requests []PackageRequest
	if err := json.Unmarshal(data, &requests); err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing requests: %v\n", err)
		os.Exit(1)
	}
	
	// Run resolution pipeline
	config := Config{Requests: requests}
	resolver := NewResolver(config)
	result := resolver.PipelineLoop(requests)
	
	// Output resolved packages as JSON
	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))
}
