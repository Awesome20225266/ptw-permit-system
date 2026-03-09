"""
Auto Push to GitHub Script
Project  : ZEL-EYE-OI
Repo     : https://github.com/Awesome20225266/ptw-permit-system
Branch   : main

Run with : python push_to_github.py
"""

import os
import sys
import shutil
import subprocess
from datetime import datetime

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

REPO_URL = "https://github.com/Awesome20225266/ptw-permit-system.git"
BRANCH   = "main"

GITIGNORE_CONTENTS = """\
# ─── Secrets — NEVER commit these ────────────────────────────────────────────
secrets.toml
secrets.toml.*
*.secrets.toml
.env
.env.*
*.env
!.env.example
!secrets.toml.example

# ─── Node / npm ───────────────────────────────────────────────────────────────
node_modules/
.pnp
.pnp.js
npm-debug.log*
yarn-error.log*
pnpm-debug.log*

# ─── Build outputs ────────────────────────────────────────────────────────────
build/
dist/
out/
.next/
.nuxt/
.cache/

# ─── Python virtual environments ──────────────────────────────────────────────
.venv/
.venv_old/
venv/
env/
backend/.venv/
backend/.venv_old/
__pycache__/
*.pyc
*.pyo

# ─── OS / editors ─────────────────────────────────────────────────────────────
.DS_Store
Thumbs.db
.idea/
.vscode/
*.swp
*~

# ─── Logs ─────────────────────────────────────────────────────────────────────
*.log
logs/

# ─── Large binary / database files (GitHub 100 MB hard limit) ─────────────────
*.duckdb
*.duckdb.wal
*.db
*.sqlite
*.sqlite3
*.parquet
*.arrow
*.h5
*.hdf5
*.pkl
*.pickle
*.bin
*.weights
*.onnx
*.pt
*.pth
*.ckpt
*.npy
*.npz
"""

# Directories to untrack if accidentally committed
UNTRACK_DIRS = [
    "node_modules",
    "frontend/node_modules",
    "backend/node_modules",
]

# File extensions that exceed GitHub's 100 MB limit when committed
LARGE_FILE_EXTENSIONS = (
    ".duckdb", ".duckdb.wal", ".db", ".sqlite", ".sqlite3",
    ".parquet", ".arrow", ".h5", ".hdf5",
    ".pkl", ".pickle", ".bin", ".weights",
    ".onnx", ".pt", ".pth", ".ckpt",
)

GIT_ENV = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}


# ── helpers ───────────────────────────────────────────────────────────────────

def run(cmd, check=True):
    """Run silently. Returns (stdout, stderr); stdout=None on failure."""
    r = subprocess.run(
        cmd, shell=True,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        stdin=subprocess.DEVNULL, env=GIT_ENV,
    )
    if check and r.returncode != 0:
        return None, r.stderr.strip()
    return r.stdout.strip(), r.stderr.strip()


def run_live(cmd):
    """Stream output live. Returns exit code."""
    r = subprocess.run(cmd, shell=True, stdin=subprocess.DEVNULL, env=GIT_ENV)
    return r.returncode


def run_stream(cmd):
    """Stream output live AND capture it. Returns (exit_code, full_output).
    Uses Popen line-by-line so large transfers don't buffer or hang."""
    proc = subprocess.Popen(
        cmd, shell=True,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL, env=GIT_ENV,
        text=True, encoding="utf-8", errors="replace",
    )
    lines = []
    for line in proc.stdout:
        print(line, end="", flush=True)
        lines.append(line)
    proc.wait()
    return proc.returncode, "".join(lines)


def step(n, msg):  print(f"\n[Step {n}] {msg}")
def ok(msg):       print(f"  [OK]  {msg}")
def info(msg):     print(f"  -->   {msg}")
def fail(msg):     print(f"  [!!]  {msg}")


# ── pre-flight cleanup ────────────────────────────────────────────────────────

def clear_stuck_git_state():
    """Delete lock files, conflict markers, rebase dirs left by crashed runs."""
    git_dir = ".git"
    if not os.path.isdir(git_dir):
        return

    stale_files = [
        "index.lock", "MERGE_HEAD", "CHERRY_PICK_HEAD",
        "REVERT_HEAD", "BISECT_LOG",
    ]
    stale_dirs = ["rebase-merge", "rebase-apply"]
    cleaned = False

    for name in stale_files:
        path = os.path.join(git_dir, name)
        if os.path.isfile(path):
            try:
                os.remove(path)
                info(f"Removed stale git file: {name}")
                cleaned = True
            except OSError as e:
                fail(f"Cannot remove {path}: {e}")
                fail("Close all other git/editor processes then retry.")
                sys.exit(1)

    for name in stale_dirs:
        path = os.path.join(git_dir, name)
        if os.path.isdir(path):
            try:
                shutil.rmtree(path)
                info(f"Cleared stuck git state: {name}")
                cleaned = True
            except OSError as e:
                fail(f"Cannot remove {path}: {e}")
                sys.exit(1)

    if cleaned:
        ok("Cleaned up interrupted git state from a previous run.")


# ── file scanners ─────────────────────────────────────────────────────────────

def find_tracked_env_files():
    """Return list of secret/credential files currently tracked by git."""
    out, _ = run("git ls-files", check=False)
    if not out:
        return []
    result = []
    for line in out.splitlines():
        stripped = line.strip()
        l = stripped.lower()
        # .env patterns
        if l.endswith(".env") or "/.env" in l or l == ".env":
            result.append(stripped)
        # secrets.toml — our primary secrets file
        elif l == "secrets.toml" or l.endswith("/secrets.toml") or l.endswith("\\secrets.toml"):
            result.append(stripped)
        # any *.toml that looks like it carries secrets
        elif l.endswith(".secrets.toml") or "secrets." in l and l.endswith(".toml"):
            result.append(stripped)
    return result


def find_tracked_large_files():
    """Return list of large binary files currently tracked by git."""
    out, _ = run("git ls-files", check=False)
    if not out:
        return []
    result = []
    for line in out.splitlines():
        stripped = line.strip()
        lower = stripped.lower()
        if any(lower.endswith(ext) for ext in LARGE_FILE_EXTENSIONS):
            result.append(stripped)
    return result


# ── history rebuild ───────────────────────────────────────────────────────────

def rebuild_clean_history(reason="blocked files in git history"):
    """
    Create a fresh orphan branch with a single clean commit that respects
    .gitignore (excludes secrets, large files, node_modules), then force-push.
    """
    print()
    info("=" * 56)
    info(f"Rebuilding git history — {reason}")
    info("This creates a single clean commit with no blocked files.")
    info("=" * 56)
    print()

    # Update .gitignore first so the new commit excludes everything
    with open(".gitignore", "w", encoding="utf-8") as fh:
        fh.write(GITIGNORE_CONTENTS)
    ok(".gitignore refreshed with all exclusion rules.")

    # Untrack known bad files from current index
    for f in find_tracked_env_files() + find_tracked_large_files():
        run(f'git rm --cached "{f}"', check=False)
        ok(f"  Untracked: {f}")
    for d in UNTRACK_DIRS:
        run(f'git rm -r --cached "{d}"', check=False)

    # Create orphan branch — no history at all
    run("git checkout --orphan _clean_temp", check=False)

    # Stage everything (respects .gitignore)
    run("git add .", check=False)

    ts  = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    msg = f"Auto commit - {ts}"

    result = subprocess.run(
        f'git commit -m "{msg}"',
        shell=True, capture_output=True, text=True,
        encoding="utf-8", errors="replace",
        stdin=subprocess.DEVNULL, env=GIT_ENV,
    )
    combined = (result.stdout + result.stderr).lower()

    if result.returncode != 0 and "nothing to commit" not in combined:
        fail(f"Commit failed during rebuild: {result.stderr.strip()}")
        run(f"git checkout {BRANCH}", check=False)
        run("git branch -D _clean_temp", check=False)
        return False

    ok(f"Clean commit created: {msg}")

    # Replace main with the clean orphan branch
    run(f"git branch -D {BRANCH}", check=False)
    run(f"git branch -m {BRANCH}", check=False)

    print()
    info("Force-pushing clean history to GitHub...")
    print()
    code = run_live(f"git push -u origin {BRANCH} --force")
    return code == 0


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  GitHub Auto Push -- ZEL-EYE-OI")
    print("  Repository : ptw-permit-system")
    print("  Branch     : main")
    print("=" * 60)

    # Pre-flight: kill any hung git state from previous crashes
    clear_stuck_git_state()

    # ── Step 1: git installed? ────────────────────────────────────────────────
    step(1, "Checking git installation...")
    out, _ = run("git --version")
    if out is None:
        fail("Git is not installed.")
        print("  Install from: https://git-scm.com/download/win")
        sys.exit(1)
    ok(out)

    # ── Step 2: initialise repo ───────────────────────────────────────────────
    step(2, "Checking git initialisation...")
    if not os.path.isdir(".git"):
        out, err = run("git init")
        if out is None:
            fail(f"git init failed: {err}")
            sys.exit(1)
        ok("Initialised new git repository.")
    else:
        ok("Git already initialised.")

    # ── Step 3: .gitignore ────────────────────────────────────────────────────
    step(3, "Checking .gitignore...")
    if not os.path.isfile(".gitignore"):
        with open(".gitignore", "w", encoding="utf-8") as fh:
            fh.write(GITIGNORE_CONTENTS)
        ok(".gitignore created.")
    else:
        # Ensure all critical exclusions exist; rewrite if any are missing
        with open(".gitignore", "r", encoding="utf-8") as fh:
            existing = fh.read()
        missing = []
        if "secrets.toml" not in existing:
            missing.append("secrets.toml rule")
        if "*.duckdb" not in existing:
            missing.append("large-file rules")
        if ".venv" not in existing:
            missing.append(".venv rule")
        if missing:
            # Overwrite with the canonical complete content
            with open(".gitignore", "w", encoding="utf-8") as fh:
                fh.write(GITIGNORE_CONTENTS)
            ok(f".gitignore refreshed — added: {', '.join(missing)}.")
        else:
            ok(".gitignore exists and is up to date.")

    # ── Step 3b: untrack large/sensitive files from git index ─────────────────
    step("3b", "Untracking large/sensitive files from git index...")
    removed = False

    for d in UNTRACK_DIRS:
        out, _ = run(f'git ls-files -- "{d}"', check=False)
        if out and out.strip():
            run(f'git rm -r --cached "{d}"', check=False)
            ok(f"Untracked directory: {d}")
            removed = True

    for f in find_tracked_env_files():
        run(f'git rm --cached "{f}"', check=False)
        ok(f"Untracked secret: {f}")
        removed = True

    for f in find_tracked_large_files():
        run(f'git rm --cached "{f}"', check=False)
        ok(f"Untracked large file: {f}")
        removed = True

    if not removed:
        ok("Nothing sensitive or oversized tracked.")

    # ── Step 4: stage ────────────────────────────────────────────────────────
    step(4, "Staging all files (git add .)...")
    _, err = run("git add .")
    if err and "fatal" in err.lower():
        fail(f"git add failed: {err}")
        sys.exit(1)
    ok("All files staged.")

    # ── Step 5: commit ────────────────────────────────────────────────────────
    step(5, "Committing...")
    status_out, _ = run("git status --porcelain", check=False)
    if not (status_out and status_out.strip()):
        ok("Nothing new to commit — working tree is clean.")
    else:
        ts  = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        msg = f"Auto commit - {ts}"
        result = subprocess.run(
            f'git commit -m "{msg}"',
            shell=True, capture_output=True, text=True,
            encoding="utf-8", errors="replace",
            stdin=subprocess.DEVNULL, env=GIT_ENV,
        )
        combined = (result.stdout + result.stderr).lower()
        if result.returncode != 0:
            if "user.email" in combined or "user.name" in combined:
                fail("Git identity not configured.")
                print('  Run: git config --global user.email "you@example.com"')
                print('  Run: git config --global user.name  "Your Name"')
                sys.exit(1)
            fail(f"Commit failed: {result.stderr.strip()}")
            sys.exit(1)
        ok(f"Committed: {msg}")

    # ── Step 6: remote ────────────────────────────────────────────────────────
    step(6, "Checking remote 'origin'...")
    out, _ = run("git remote get-url origin")
    if out is None:
        run(f"git remote add origin {REPO_URL}")
        ok(f"Remote added: {REPO_URL}")
    else:
        ok(f"Remote: {out}")

    # ── Step 7: branch ────────────────────────────────────────────────────────
    step(7, "Ensuring branch is 'main'...")
    out, _ = run("git branch --show-current")
    if (out or "") != BRANCH:
        run(f"git branch -M {BRANCH}")
        ok(f"Renamed branch to '{BRANCH}'.")
    else:
        ok(f"Already on '{BRANCH}'.")

    # ── Step 8: push ─────────────────────────────────────────────────────────
    step(8, "Pushing to GitHub...")
    info("This may take a moment...")
    print()

    push_code, push_out = run_stream(f"git push -u origin {BRANCH}")

    # ── Step 9: handle failures ───────────────────────────────────────────────
    if push_code != 0:
        low = push_out.lower()

        def needs_rebuild(text):
            return (
                "secret" in text or "push protection" in text
                or "repository rule violations" in text
                or "gh001" in text or "large files detected" in text
                or "exceeds github" in text or "file size limit" in text
            )

        def needs_fetch_retry(text):
            return "rejected" in text or "non-fast-forward" in text or "fetch first" in text

        # Large file or secret blocked
        if needs_rebuild(low):
            reason = "large file (>100 MB)" if "large" in low or "gh001" in low else "secret in history"
            ok_rebuild = rebuild_clean_history(reason)
            if not ok_rebuild:
                fail("Could not push even after rebuilding history.")
                sys.exit(1)

        # Remote is ahead — fetch then force-with-lease
        elif needs_fetch_retry(low):
            print()
            info("Remote has commits not in local. Fetching...")
            fetch_code = run_live(f"git fetch origin {BRANCH}")
            if fetch_code != 0:
                fail("Fetch failed — check your internet / GitHub access.")
                sys.exit(1)

            print()
            info("Retrying with force-with-lease...")
            print()
            retry_code, retry_out = run_stream(
                f"git push -u origin {BRANCH} --force-with-lease"
            )

            if retry_code != 0:
                low2 = retry_out.lower()
                if needs_rebuild(low2):
                    reason = "large file (>100 MB)" if "large" in low2 or "gh001" in low2 else "secret in history"
                    ok_rebuild = rebuild_clean_history(reason)
                    if not ok_rebuild:
                        fail("Could not push even after rebuilding history.")
                        sys.exit(1)
                else:
                    fail("Push failed.")
                    print()
                    print("  Authenticate with GitHub CLI:")
                    print("    gh auth login")
                    print()
                    print("  Or use a Personal Access Token:")
                    print(f"    git remote set-url origin https://<TOKEN>@github.com/Awesome20225266/ptw-permit-system.git")
                    sys.exit(1)
        else:
            fail("Push failed.")
            print()
            print("  Authenticate with GitHub CLI:")
            print("    gh auth login")
            sys.exit(1)

    # ── Step 10: success ──────────────────────────────────────────────────────
    print()
    print("=" * 60)
    print("  SUCCESS! Project pushed to GitHub.")
    print(f"  URL    : https://github.com/Awesome20225266/ptw-permit-system")
    print(f"  Branch : {BRANCH}")
    print(f"  Time   : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    main()
