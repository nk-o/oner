#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys


def docker(*args):
    return subprocess.run(["docker", *args], check=True, capture_output=True, text=True).stdout


def inventory(kind):
    args = [kind, "ls", "-aq"] if kind == "container" else [kind, "ls", "-q"]
    if kind != "volume":
        args.append("--no-trunc")
    ids = sorted(set(docker(*args).split()))
    if not ids:
        return []
    rows = json.loads(docker(kind, "inspect", *ids))
    key = "Name" if kind == "volume" else "Id"
    if not isinstance(rows, list) or any(not isinstance(r, dict) or not isinstance(r.get(key), str) for r in rows):
        raise ValueError("Invalid Docker inventory")
    for row in rows:
        if kind != "volume" and not isinstance(row.get("Config"), dict):
            raise ValueError("Invalid Docker configuration")
        meta = row.get("Config", row).get("Labels")
        if meta is not None and (not isinstance(meta, dict) or any(not isinstance(v, str) for v in meta.values())):
            raise ValueError("Invalid Docker labels")
        if kind == "container" and (not isinstance(row.get("Image"), str) or not isinstance(row.get("Mounts"), list)):
            raise ValueError("Invalid Docker container references")
        if kind == "image" and row.get("RepoTags") is not None and (not isinstance(row["RepoTags"], list) or any(not isinstance(v, str) for v in row["RepoTags"])):
            raise ValueError("Invalid Docker image tags")
    return rows


def wp_project(project):
    return project == "wp-env" or project.startswith("wp-env-")


def labels(row):
    return (row.get("Config", row).get("Labels") or {})


def inside(path, root):
    return path == root or root in path.parents


def runtime_directories(home):
    if home == home.parent or home == Path.home().resolve() or (home / ".git").exists():
        raise ValueError("Refusing an unsafe wp-env home")
    if not home.exists():
        return []
    return [p for p in home.iterdir() if p.is_dir() and (p / "docker-compose.yml").is_file() and not (p / ".git").exists()]


def make_plan(home, containers, volumes, images):
    directories = runtime_directories(home)
    projects = {p.name for p in directories}
    compose_images = set()
    for p in directories:
        for line in (p / "docker-compose.yml").read_text().splitlines():
            match = re.fullmatch(r"\s*image:\s*['\"]?([^\s'\"#]+)['\"]?\s*(?:#.*)?", line)
            if match and "$" not in match[1]:
                compose_images.add(match[1])
    for c in containers:
        meta = labels(c)
        project = meta.get("com.docker.compose.project", "")
        workdir = meta.get("com.docker.compose.project.working_dir", "")
        if project and (wp_project(project) or workdir and inside(Path(workdir).resolve(), home)):
            projects.add(project)

    def owned(c):
        project = labels(c).get("com.docker.compose.project", "")
        if project:
            return project in projects or wp_project(project)
        return c.get("Name", "").lstrip("/").startswith("wp-env-")

    selected = [c for c in containers if owned(c)]
    other = [c for c in containers if not owned(c)]
    used_volumes = {m["Name"] for c in selected for m in c.get("Mounts", []) if m.get("Type") == "volume"}
    other_volumes = {m["Name"] for c in other for m in c.get("Mounts", []) if m.get("Type") == "volume"}
    other_images = {c["Image"] for c in other}
    used_images = {c["Image"] for c in selected}
    kept = []
    selected_volumes = []
    for v in volumes:
        project = labels(v).get("com.docker.compose.project", "")
        if v["Name"] not in used_volumes and project not in projects and not wp_project(project) and not any(v["Name"].startswith(p + "_") for p in projects):
            continue
        if v["Name"] in other_volumes:
            kept.append("shared volume " + v["Name"])
        else:
            selected_volumes.append(v["Name"])

    selected_images = []
    prefixes = tuple({"wp-env-"} | {p + suffix for p in projects for suffix in ("-", "_")})
    for image in images:
        tags = image.get("RepoTags") or []
        project = labels(image).get("com.docker.compose.project", "")
        own = project in projects or wp_project(project)
        refs = []
        for tag in tags:
            repo = tag.rsplit(":", 1)[0]
            wp_tag = own or tag in compose_images or repo in {"wordpress", "library/wordpress", "docker.io/library/wordpress"} or repo.startswith(prefixes)
            runtime_base = image["Id"] in used_images and repo in {"mariadb", "mysql", "php"}
            if wp_tag or runtime_base:
                refs.append(tag)
        if not refs and not (image["Id"] in used_images and not tags):
            continue
        if image["Id"] in other_images:
            kept.append("shared image " + image["Id"])
        else:
            selected_images.extend((image["Id"], ref) for ref in (refs or [image["Id"]]))

    binds = [Path(m["Source"]).resolve() for c in other for m in c.get("Mounts", []) if m.get("Type") == "bind"]
    paths = []
    for p in directories:
        if any(inside(b, p.resolve()) or inside(p.resolve(), b) for b in binds):
            kept.append("shared runtime " + str(p))
        else:
            paths.append(p)
    return selected, selected_volumes, selected_images, paths, kept


def foreign_references(home):
    rows = inventory("container")
    selected, _, _, _, _ = make_plan(home, rows, [], [])
    ids = {c["Id"] for c in selected}
    other = [c for c in rows if c["Id"] not in ids]
    return rows, other


def purge(home, apply):
    containers = inventory("container")
    volumes = inventory("volume")
    images = inventory("image")
    selected, selected_volumes, selected_images, paths, kept = make_plan(home, containers, volumes, images)
    for kind, items in [("container", [c["Id"] for c in selected]), ("volume", selected_volumes), ("image", [ref for _, ref in selected_images]), ("runtime", paths)]:
        for item in items:
            print(f"  wp-purge  {kind} {item}", flush=True)
    for item in kept:
        print("  kept      " + item, flush=True)
    if apply:
        for c in selected:
            docker("container", "rm", "-f", c["Id"])
        remaining, other = foreign_references(home)
        if len(remaining) != len(other):
            raise ValueError("New wp-env containers appeared; preview again")
        protected_volumes = {m["Name"] for c in other for m in c.get("Mounts", []) if m.get("Type") == "volume"}
        for name in selected_volumes:
            if name in protected_volumes:
                raise ValueError("A selected volume gained a non-WordPress reference; preview again")
            docker("volume", "rm", name)
        for image_id, ref in selected_images:
            remaining, other = foreign_references(home)
            if len(remaining) != len(other):
                raise ValueError("New wp-env containers appeared before image cleanup; preview again")
            if image_id in {c["Image"] for c in other}:
                raise ValueError("A selected image gained a non-WordPress reference; preview again")
            docker("image", "rm", ref)
        if paths:
            remaining, other = foreign_references(home)
            if len(remaining) != len(other):
                raise ValueError("New wp-env containers appeared before runtime cleanup; preview again")
        for p in paths:
            if (p / ".git").exists():
                raise ValueError("A runtime directory became a source checkout; preview again")
            binds = [Path(m["Source"]).resolve() for c in other for m in c.get("Mounts", []) if m.get("Type") == "bind"]
            if any(inside(b, p.resolve()) or inside(p.resolve(), b) for b in binds):
                raise ValueError("A runtime directory gained a non-WordPress reference; preview again")
            if p.is_symlink():
                p.unlink()
            elif p.exists():
                shutil.rmtree(p)
    print(f"wp-env purge: {len(selected)} containers, {len(selected_volumes)} volumes, {len(selected_images)} image references, {len(paths)} runtime directories. Apply: {str(apply).lower()}.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("home", type=Path)
    parser.add_argument("--yes", action="store_true")
    args = parser.parse_args()
    try:
        purge(args.home.resolve(), args.yes)
    except (OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError) as error:
        detail = error.stderr.strip().splitlines()[0] if isinstance(error, subprocess.CalledProcessError) and error.stderr.strip() else str(error)
        print("wp-env purge failed: " + detail, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
