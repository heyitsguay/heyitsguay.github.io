#!/usr/bin/env bash
# gen-manifest.sh — scans levels/ and builds levels/manifest.json
#
# Reads levels/epoch-names.json for epoch metadata, matches every *.json
# level file (excluding epoch-names.json and manifest.json) to an epoch
# by its filename prefix, sorts by puzzle number, and writes manifest.json.
#
# Usage:  ./gen-manifest.sh          (run from the agrav/ directory)
#         ./gen-manifest.sh /path/to/agrav

set -euo pipefail

ROOT="${1:-.}"

python3 - "$ROOT" << 'PYEOF'
import json, os, re, sys

root = sys.argv[1]
levels_dir = os.path.join(root, "levels")
epoch_file = os.path.join(levels_dir, "epoch-names.json")

with open(epoch_file) as f:
    epoch_names = json.load(f)

# Build prefix -> (group, name) lookup
prefix_info = {}
for group in ("game-epochs", "developer-epochs"):
    for prefix, name in epoch_names.get(group, {}).items():
        prefix_info[prefix] = (group, name)

# Scan level files
prefix_files = {}
for fname in sorted(os.listdir(levels_dir)):
    if not fname.endswith(".json"):
        continue
    if fname in ("epoch-names.json", "manifest.json"):
        continue
    prefix = fname.split("-")[0]
    if prefix not in prefix_info:
        print(f"WARNING: {fname} has unknown prefix '{prefix}', skipping", file=sys.stderr)
        continue
    prefix_files.setdefault(prefix, []).append(fname)

# Sort each prefix's files by puzzle number
def puzzle_num(f):
    m = re.search(r"-p(\d+)", f)
    return int(m.group(1)) if m else 999

for prefix in prefix_files:
    prefix_files[prefix].sort(key=puzzle_num)

# Assemble manifest
manifest = {}
for group in ("game-epochs", "developer-epochs"):
    manifest[group] = {}
    for prefix, name in epoch_names.get(group, {}).items():
        manifest[group][prefix] = {
            "name": name,
            "levels": prefix_files.get(prefix, [])
        }

out = os.path.join(levels_dir, "manifest.json")
with open(out, "w") as f:
    json.dump(manifest, f, indent=2)

print(f"Wrote {out}")
for group in manifest:
    for prefix, data in manifest[group].items():
        print(f"  {group}/{prefix}: {len(data['levels'])} level(s)")
PYEOF
