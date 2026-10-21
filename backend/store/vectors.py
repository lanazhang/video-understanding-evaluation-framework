"""Vector storage in the app's SQLite file, replacing S3 Vectors.

Vectors are stored exactly as the model returned them (float32 blobs, no truncation, no re-normalising). Search is an
exact cosine scan with numpy, normalising at query time. That is plenty for the sizes involved here (a few hundred
segments per video) and needs no SQLite extension.
"""
import numpy as np

from .sqlite_table import _conn, _init_lock


def init_vectors():
    with _init_lock:
        _conn().execute(
            "CREATE TABLE IF NOT EXISTS vectors ("
            " index_name TEXT NOT NULL, key TEXT NOT NULL, task_id TEXT, video_id TEXT,"
            " start_sec REAL, end_sec REAL, dim INTEGER NOT NULL, vec BLOB NOT NULL,"
            " PRIMARY KEY (index_name, key)) WITHOUT ROWID"
        )
        # Databases created before modalities existed have no `option` column; everything there was visual
        columns = [row[1] for row in _conn().execute("PRAGMA table_info(vectors)")]
        if "option" not in columns:
            _conn().execute("ALTER TABLE vectors ADD COLUMN option TEXT NOT NULL DEFAULT 'video'")
        # Earlier builds named the modalities visual / audio_visual; they are now the input types they were built from
        _conn().execute("UPDATE vectors SET option='video' WHERE option='visual'")
        _conn().execute("UPDATE vectors SET option='video+audio' WHERE option='audio_visual'")


def _float32(vector) -> np.ndarray:
    return np.asarray(vector, dtype=np.float32)


def put(index_name, items):
    """items: [{key, task_id, video_id, start_sec, end_sec, vector, option?}]  (option: the inputs it was made from, e.g. video | audio | image | video+audio)"""
    conn = _conn()
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.executemany(
            "INSERT OR REPLACE INTO vectors (index_name, key, task_id, video_id, start_sec, end_sec, dim, vec, option)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            [
                (index_name, i["key"], i.get("task_id"), i.get("video_id"), i["start_sec"], i["end_sec"],
                 len(i["vector"]), _float32(i["vector"]).tobytes(), i.get("option", "video"))
                for i in items
            ],
        )
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise


def query(index_name, vector, top_k=5, options=None):
    """Nearest segments by cosine distance (0 = identical). `options` limits the modalities searched.
    Returns [{key, distance, metadata}]."""
    sql = "SELECT key, task_id, video_id, start_sec, end_sec, dim, vec, option FROM vectors WHERE index_name=?"
    args = [index_name]
    if options:
        sql += f" AND option IN ({','.join('?' * len(options))})"
        args += list(options)
    rows = _conn().execute(sql, args).fetchall()
    q = _float32(vector)
    rows = [r for r in rows if r[5] == len(q)]
    if not rows:
        return []
    matrix = np.stack([np.frombuffer(r[6], dtype=np.float32) for r in rows])
    # cosine distance, normalising here rather than altering what is stored
    norms = np.maximum(np.linalg.norm(matrix, axis=1) * float(np.linalg.norm(q)), 1e-12)
    distances = 1.0 - (matrix @ q) / norms
    order = np.argsort(distances)[: int(top_k)]
    return [
        {
            "key": rows[i][0],
            "distance": float(distances[i]),
            "metadata": {
                "task_id": rows[i][1], "video_id": rows[i][2], "startSec": rows[i][3], "endSec": rows[i][4], "option": rows[i][7],
            },
        }
        for i in order
    ]


def count(index_name) -> int:
    return _conn().execute("SELECT COUNT(*) FROM vectors WHERE index_name=?", (index_name,)).fetchone()[0]


def delete_index(index_name) -> int:
    cur = _conn().execute("DELETE FROM vectors WHERE index_name=?", (index_name,))
    return cur.rowcount
