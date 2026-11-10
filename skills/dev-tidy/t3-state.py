#!/usr/bin/env python3
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys


HOME = Path(os.environ.get("DEV_TIDY_T3_HOME", Path.home() / ".t3")).resolve()
FINISHED = {"completed", "interrupted", "failed", "cancelled", "rolled_back"}


def managed_roots():
    roots = [HOME / "worktrees"]
    settings = HOME / "userdata/settings.json"
    if settings.exists():
        data = json.loads(settings.read_text())
        for raw in [data.get("worktreesDirectory", ""), *data.get("previousWorktreesDirectories", [])]:
            if raw:
                root = Path(raw).expanduser()
                if not root.is_absolute() or root == Path(root.anchor):
                    raise ValueError("Invalid T3 worktree location")
                roots.append(root.resolve())
    return roots


def inside(path, root):
    return path == root or root in path.parents


def load_state():
    database = HOME / "userdata/statev2.sqlite"
    if not database.exists():
        return None
    connection = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=5)
    try:
        connection.execute("BEGIN")
        threads = [json.loads(row[0]) for row in connection.execute(
            "SELECT payload_json FROM orchestration_v2_projection_threads")]
        for thread in threads:
            if not isinstance(thread, dict):
                raise ValueError("Unsupported T3 thread schema")
            for field in ("id", "projectId", "branch", "worktreePath", "deletedAt", "settledAt", "archivedAt", "lineage"):
                if field not in thread:
                    raise ValueError("Unsupported T3 thread schema")
            if not all(isinstance(thread[field], str) for field in ("id", "projectId")) or not isinstance(thread["lineage"], dict):
                raise ValueError("Unsupported T3 thread schema")
            if any(thread[field] is not None and not isinstance(thread[field], str)
                   for field in ("branch", "worktreePath", "deletedAt", "settledAt", "archivedAt")):
                raise ValueError("Unsupported T3 thread schema")
        projects = dict(connection.execute("SELECT project_id, workspace_root FROM projection_projects"))
        busy = set()
        for table, terminal in (
            ("orchestration_v2_projection_runs", FINISHED),
            ("orchestration_v2_projection_runtime_requests", {"resolved", "cancelled"}),
            ("orchestration_v2_projection_subagents", FINISHED),
            ("orchestration_v2_effect_outbox", {"succeeded", "cancelled"}),
        ):
            for thread_id, status in connection.execute(f"SELECT thread_id, status FROM {table}"):
                if status not in terminal:
                    busy.add(thread_id)
        sessions = []
        for (raw,) in connection.execute("SELECT payload_json FROM orchestration_v2_projection_provider_sessions WHERE status != 'stopped'"):
            session = json.loads(raw)
            sessions.append(Path(session["cwd"]).resolve())
        return threads, projects, busy, sessions
    finally:
        connection.close()


def path_state(path):
    roots = managed_roots()
    state = load_state()
    managed = any(inside(path, root) for root in roots)
    if state is None:
        return "unknown" if managed else "none"
    threads, _, busy, sessions = state
    group = {t["id"]: t for t in threads if t["worktreePath"] and Path(t["worktreePath"]).resolve() == path}
    if not group:
        return "unknown" if managed else "none"
    if busy.intersection(group) or any(inside(cwd, path) for cwd in sessions):
        return "busy"
    for thread in group.values():
        visited = set()
        while not (thread["deletedAt"] or thread["settledAt"] or thread["archivedAt"]):
            if thread["id"] in visited:
                return "open"
            visited.add(thread["id"])
            lineage = thread["lineage"]
            if lineage.get("relationshipToParent") != "subagent":
                return "open"
            thread = group.get(lineage.get("parentThreadId"))
            if thread is None:
                return "open"
    if (path / ".git").exists():
        branch = subprocess.run(["git", "-C", str(path), "symbolic-ref", "--quiet", "--short", "HEAD"],
                                capture_output=True, text=True, check=True, timeout=5).stdout.strip()
        if any(t["branch"] != branch for t in group.values()):
            return "mismatch"
    return "settled"


def branch_state(repo, branch):
    state = load_state()
    if state is None:
        return "none"
    threads, projects, _, _ = state
    for thread in threads:
        if thread["deletedAt"] is None and thread["branch"] == branch:
            project_root = projects.get(thread["projectId"])
            if project_root is None:
                return "unknown"
            root = Path(project_root).resolve()
            if root == repo:
                return "referenced"
            def common_dir(path):
                return subprocess.run(["git", "-C", str(path), "rev-parse", "--path-format=absolute", "--git-common-dir"],
                                      capture_output=True, text=True, check=True, timeout=5).stdout.strip()
            if common_dir(root) == common_dir(repo):
                return "referenced"
    return "none"


def checkout_path(cwd):
    state = load_state()
    if state is not None:
        paths = [Path(t["worktreePath"]).resolve() for t in state[0] if t["worktreePath"]]
        matches = [path for path in paths if inside(cwd, path)]
        if matches:
            return str(max(matches, key=lambda path: len(path.parts)))
    return "none"


def main():
    mode, *args = sys.argv[1:]
    if mode == "roots":
        for root in managed_roots():
            print(root)
    elif mode == "path":
        print(path_state(Path(args[0]).resolve()))
    elif mode == "branch":
        print(branch_state(Path(args[0]).resolve(), args[1]))
    elif mode == "checkout":
        print(checkout_path(Path(args[0]).resolve()))
    else:
        raise ValueError("Unknown T3 query")


if __name__ == "__main__":
    try:
        main()
    except (OSError, sqlite3.Error, ValueError, KeyError, TypeError, IndexError, subprocess.SubprocessError):
        print("unknown")
        sys.exit(1)
