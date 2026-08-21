# ============================================================
# Escema — Vercel Environment Variables Setup Script
# Run this whenever env vars are lost or after re-linking:
#   .\scripts\setup-vercel-env.ps1
# ============================================================

param(
    [switch]$Force   # pass -Force to overwrite existing vars
)

$ErrorActionPreference = "Stop"

# ── 1. Ensure we're linked ───────────────────────────────────
Write-Host "`n[1/3] Linking project to Vercel..." -ForegroundColor Cyan
vercel link --yes

# ── 2. Load values from .env.local ──────────────────────────
Write-Host "`n[2/3] Reading .env.local..." -ForegroundColor Cyan

$envFile = Join-Path $PSScriptRoot "..\\.env.local"
if (-not (Test-Path $envFile)) {
    Write-Error ".env.local not found at $envFile"
    exit 1
}

$envVars = @{}
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line -match "^([^=]+)=(.*)$") {
        $key   = $matches[1].Trim()
        $value = $matches[2].Trim()
        # Strip inline comments (e.g. key=value # comment)
        $value = ($value -split "\s+#")[0].Trim()
        # Strip surrounding quotes
        $value = $value -replace '^["'']|["'']$', ''
        if ($key -and $value) {
            $envVars[$key] = $value
        }
    }
}

# ── 3. Variables to push to Vercel ──────────────────────────
# These are the server-side AI vars (NOT VITE_ prefix) needed by /api/ai-proxy
# and the client-side VITE_ vars needed by the frontend build.
$toSync = @(
    # Server-side (Edge Function) — never exposed to browser
    "AI_API_KEY",
    "AI_BASE_URL",
    "AI_MODEL",
    "AI_MODEL_FALLBACK_1",
    "AI_MODEL_FALLBACK_2",
    "AI_MODEL_FALLBACK_3",

    # Client-side (baked into frontend bundle at build time)
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_AI_MODEL",
    "VITE_AI_MODEL_FALLBACK_1",
    "VITE_AI_MODEL_FALLBACK_2",
    "VITE_AI_MODEL_FALLBACK_3",
    "VITE_AI_BASE_URL",
    "VITE_AI_API_KEY"
)

Write-Host "`n[3/3] Syncing environment variables to Vercel Production..." -ForegroundColor Cyan

$added   = 0
$skipped = 0
$missing = 0

foreach ($key in $toSync) {
    if (-not $envVars.ContainsKey($key)) {
        Write-Warning "  MISSING in .env.local: $key — skipped"
        $missing++
        continue
    }

    $value = $envVars[$key]

    # Always use --force so existing vars get overwritten without errors
    $result = ($value | vercel env add $key production --force 2>&1)

    if ($result -match "already exists") {
        Write-Host "  SKIP  $key (already set)" -ForegroundColor DarkGray
        $skipped++
    } elseif ($result -match "Added") {
        Write-Host "  OK    $key" -ForegroundColor Green
        $added++
    } else {
        Write-Host "  WARN  $key — $result" -ForegroundColor Yellow
    }
}

# ── Summary ─────────────────────────────────────────────────
Write-Host ""
Write-Host "Done!" -ForegroundColor Green
Write-Host "  Added:   $added"
Write-Host "  Skipped: $skipped (already existed)"
Write-Host "  Missing: $missing (not in .env.local)"

if ($added -gt 0) {
    Write-Host ""
    Write-Host "Deploying to production..." -ForegroundColor Cyan
    vercel --prod
}
