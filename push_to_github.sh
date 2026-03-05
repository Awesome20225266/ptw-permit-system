#!/usr/bin/env bash
# =============================================================
#  Auto Push to GitHub — ZEL-EYE-OI
#  Repository : https://github.com/Awesome20225266/ptw-permit-system
#  Branch     : main
#
#  Run with:  bash push_to_github.sh
# =============================================================

REPO_URL="https://github.com/Awesome20225266/ptw-permit-system.git"
BRANCH="main"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Colour

step()    { echo -e "\n${CYAN}[Step $1]${NC} $2"; }
success() { echo -e "  ${GREEN}✔${NC}  $1"; }
info()    { echo -e "  →  $1"; }
err()     { echo -e "  ${RED}✘${NC}  $1"; }

echo "============================================================"
echo "  GitHub Auto Push — ZEL-EYE-OI"
echo "  Repository : ptw-permit-system"
echo "  Branch     : main"
echo "============================================================"

# Change to the directory where this script lives
cd "$(dirname "$0")" || exit 1

# ------------------------------------------------------------
# Step 1 — Check git installation
# ------------------------------------------------------------
step 1 "Checking if git is installed..."
if ! command -v git &>/dev/null; then
    err "Git is not installed."
    echo ""
    echo "  Please install Git from: https://git-scm.com/download/win"
    echo "  After installation, restart your terminal and run this script again."
    exit 1
fi
success "Git found: $(git --version)"

# ------------------------------------------------------------
# Step 2 — Initialize git if not already initialized
# ------------------------------------------------------------
step 2 "Checking git initialization..."
if [ ! -d ".git" ]; then
    info "No .git folder found. Initializing repository..."
    git init || { err "Failed to initialize git."; exit 1; }
    success "Git repository initialized."
else
    success "Git already initialized."
fi

# ------------------------------------------------------------
# Step 3 — Create .gitignore if it does not exist
# ------------------------------------------------------------
step 3 "Checking .gitignore..."
if [ ! -f ".gitignore" ]; then
    info "Creating .gitignore..."
    cat > .gitignore <<'EOF'
node_modules
.env
build
dist
venv
__pycache__
*.pyc
*.pyo
.DS_Store
Thumbs.db
.idea
.vscode
*.log
EOF
    success ".gitignore created."
else
    success ".gitignore already exists — skipping."
fi

# ------------------------------------------------------------
# Step 4 — Stage all files
# ------------------------------------------------------------
step 4 "Staging all project files (git add .)..."
git add . || { err "Failed to stage files."; exit 1; }
success "All files staged."

# ------------------------------------------------------------
# Step 5 — Create a timestamped commit
# ------------------------------------------------------------
step 5 "Creating commit..."
COMMIT_MSG="Auto commit - ${TIMESTAMP}"
COMMIT_OUT=$(git commit -m "$COMMIT_MSG" 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    if echo "$COMMIT_OUT" | grep -q "nothing to commit"; then
        success "Nothing new to commit — working tree is clean."
    elif echo "$COMMIT_OUT" | grep -qE "user\.email|user\.name"; then
        err "Git user identity is not configured."
        echo ""
        echo "  Run these commands once to fix this:"
        echo '  git config --global user.email "you@example.com"'
        echo '  git config --global user.name "Your Name"'
        exit 1
    else
        err "Commit failed: $COMMIT_OUT"
        exit 1
    fi
else
    success "Committed: $COMMIT_MSG"
fi

# ------------------------------------------------------------
# Step 6 — Add remote origin if missing
# ------------------------------------------------------------
step 6 "Checking remote 'origin'..."
if ! git remote get-url origin &>/dev/null; then
    info "Remote 'origin' not found. Adding: $REPO_URL"
    git remote add origin "$REPO_URL" || { err "Failed to add remote."; exit 1; }
    success "Remote 'origin' added."
else
    success "Remote 'origin' already set to: $(git remote get-url origin)"
fi

# ------------------------------------------------------------
# Step 7 — Ensure branch is named 'main'
# ------------------------------------------------------------
step 7 "Ensuring branch is named 'main'..."
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
    info "Current branch is '$CURRENT_BRANCH'. Renaming to '$BRANCH'..."
    git branch -M "$BRANCH" || { err "Failed to rename branch."; exit 1; }
    success "Branch renamed to '$BRANCH'."
else
    success "Already on branch '$BRANCH'."
fi

# ------------------------------------------------------------
# Step 8 — Push to GitHub
# ------------------------------------------------------------
step 8 "Pushing to GitHub ($REPO_URL)..."
info "This may take a moment..."
echo ""

# ------------------------------------------------------------
# Step 9 — Handle push errors
# ------------------------------------------------------------
if ! git push -u origin "$BRANCH"; then
    echo ""
    err "Push failed. Common reasons and fixes:"
    echo ""
    echo "  1. Authentication error:"
    echo "     → Log in via GitHub CLI:  gh auth login"
    echo "     → Or set a PAT token URL:"
    echo "       git remote set-url origin https://<TOKEN>@github.com/Awesome20225266/ptw-permit-system.git"
    echo ""
    echo "  2. Remote has changes you don't have locally:"
    echo "     → Run: git pull origin main --rebase"
    echo "     → Then re-run this script."
    echo ""
    echo "  3. Repository doesn't exist or you lack push access:"
    echo "     → Check: https://github.com/Awesome20225266/ptw-permit-system"
    echo ""
    exit 1
fi

# ------------------------------------------------------------
# Step 10 — Success
# ------------------------------------------------------------
echo ""
echo "============================================================"
echo -e "  ${GREEN}SUCCESS!${NC} Project pushed to GitHub."
echo "  URL    : https://github.com/Awesome20225266/ptw-permit-system"
echo "  Branch : $BRANCH"
echo "  Time   : $TIMESTAMP"
echo "============================================================"
