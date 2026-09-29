import platform
import subprocess
import sys

# On Windows, invoke npm via cmd.exe (runs npm.cmd) rather than PowerShell.
# PowerShell's execution policy can block npm.ps1 ("running scripts is
# disabled on this system"), which prevents the linter from starting.
if platform.system() == "Windows":
    cmd = ["cmd", "/c", "npm run lint"]
else:
    cmd = ["npm", "run", "lint"]

result = subprocess.run(cmd, cwd="frontend")
sys.exit(result.returncode)
