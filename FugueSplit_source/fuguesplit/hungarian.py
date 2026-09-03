"""Minimum-cost assignment (Hungarian / Kuhn-Munkres), O(n^3).

Small self-contained solver so the package stays dependency-light: the
matrices here are at most a handful of notes against a handful of parts.
"""

from __future__ import annotations

INF = float("inf")


def solve(cost: list[list[float]]) -> list[int]:
    """Assign each row to a distinct column at minimum total cost.

    Returns `assignment[row] = col`. Requires rows <= cols.
    """
    n_rows = len(cost)
    if n_rows == 0:
        return []
    n_cols = len(cost[0])
    if n_cols < n_rows:
        raise ValueError("assignment needs at least as many columns as rows")

    # u/v are the dual potentials; way[] reconstructs the augmenting path.
    u = [0.0] * (n_rows + 1)
    v = [0.0] * (n_cols + 1)
    parent = [0] * (n_cols + 1)   # parent[col] = row matched to col
    way = [0] * (n_cols + 1)

    for row in range(1, n_rows + 1):
        parent[0] = row
        col0 = 0
        minv = [INF] * (n_cols + 1)
        used = [False] * (n_cols + 1)
        while True:
            used[col0] = True
            cur_row = parent[col0]
            delta, col1 = INF, 0
            for col in range(1, n_cols + 1):
                if used[col]:
                    continue
                cur = cost[cur_row - 1][col - 1] - u[cur_row] - v[col]
                if cur < minv[col]:
                    minv[col], way[col] = cur, col0
                if minv[col] < delta:
                    delta, col1 = minv[col], col
            for col in range(n_cols + 1):
                if used[col]:
                    u[parent[col]] += delta
                    v[col] -= delta
                else:
                    minv[col] -= delta
            col0 = col1
            if parent[col0] == 0:
                break
        # Walk the alternating path back, re-matching along the way.
        while col0:
            col1 = way[col0]
            parent[col0] = parent[col1]
            col0 = col1

    assignment = [-1] * n_rows
    for col in range(1, n_cols + 1):
        if 1 <= parent[col] <= n_rows:
            assignment[parent[col] - 1] = col - 1
    return assignment
