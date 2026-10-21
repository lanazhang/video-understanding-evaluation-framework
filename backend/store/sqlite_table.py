"""SQLite-backed stand-in for the boto3 DynamoDB `Table` resource.

All tables share one `items` table:  (tbl, pk, sk, data JSON).  Global secondary indexes become
SQLite expression indexes on json_extract(data, '$.<attr>'). Numbers come back as Decimal, like DynamoDB.
"""
import json
import os
import re
import sqlite3
import threading
from decimal import Decimal
from pathlib import Path

from botocore.exceptions import ClientError

from . import conditions as C

# name -> {"pk": str, "sk": str|None, "gsis": {index_name: attr}}
_SCHEMAS: dict[str, dict] = {}

_local = threading.local()
_init_lock = threading.Lock()
_db_path: Path | None = None
_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def data_dir() -> Path:
    root = Path(os.environ.get("DATA_DIR") or Path(__file__).resolve().parents[2] / "data")
    root.mkdir(parents=True, exist_ok=True)
    return root


def register_table(name, pk, sk=None, gsis=None):
    _SCHEMAS[name] = {"pk": pk, "sk": sk, "gsis": dict(gsis or {})}


def _conn() -> sqlite3.Connection:
    global _db_path
    if _db_path is None:
        _db_path = data_dir() / "app.db"
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = sqlite3.connect(_db_path, timeout=10, isolation_level=None)  # autocommit; we BEGIN explicitly
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA busy_timeout=10000")
        _local.conn = conn
    return conn


def init_db():
    """Create the items table and one expression index per registered GSI. Idempotent."""
    with _init_lock:
        conn = _conn()
        conn.execute(
            "CREATE TABLE IF NOT EXISTS items ("
            " tbl TEXT NOT NULL, pk TEXT NOT NULL, sk TEXT NOT NULL DEFAULT '', data TEXT NOT NULL,"
            " PRIMARY KEY (tbl, pk, sk)) WITHOUT ROWID"
        )
        for name, schema in _SCHEMAS.items():
            for index_name, attr in schema["gsis"].items():
                if not _IDENT.match(attr):
                    raise ValueError(f"bad attribute name {attr!r}")
                idx = re.sub(r"\W", "_", f"gsi_{name}_{index_name}")
                conn.execute(
                    f"CREATE INDEX IF NOT EXISTS {idx} ON items(tbl, json_extract(data, '$.{attr}')) WHERE tbl = '{name}'"
                )


def _dumps(item):
    def default(o):
        if isinstance(o, Decimal):
            return int(o) if o == o.to_integral_value() else float(o)
        if isinstance(o, (set, frozenset)):
            return sorted(o)
        if isinstance(o, (bytes, bytearray)):
            raise TypeError("binary attributes are not supported by the local store")
        raise TypeError(f"{type(o).__name__} is not JSON serializable")

    return json.dumps(item, default=default, separators=(",", ":"))


def _loads(text):
    return json.loads(text, parse_float=Decimal, parse_int=Decimal)


def _client_error(code, message, op):
    return ClientError({"Error": {"Code": code, "Message": message}}, op)


class Table:
    def __init__(self, name):
        if name not in _SCHEMAS:
            raise ValueError(f"table {name!r} is not registered (see store/schema.py)")
        self.name = self.table_name = name
        self._schema = _SCHEMAS[name]

    # -- key helpers -------------------------------------------------------
    def _key_parts(self, key: dict):
        pk_attr, sk_attr = self._schema["pk"], self._schema["sk"]
        if pk_attr not in key:
            raise _client_error("ValidationException", f"The provided key element does not match the schema: need {pk_attr}", "Key")
        if sk_attr and sk_attr not in key:
            raise _client_error("ValidationException", f"The provided key element does not match the schema: need {sk_attr}", "Key")
        return str(key[pk_attr]), (str(key[sk_attr]) if sk_attr else "")

    def _row(self, item):
        return self._key_parts({k: item[k] for k in (self._schema["pk"], self._schema["sk"]) if k and k in item})

    def _check(self, existing, condition, names, values, op):
        cond = C.parse_condition(condition, names, values)
        if cond is not None and not cond.matches(existing or {}):
            raise _client_error("ConditionalCheckFailedException", "The conditional request failed", op)

    # -- single-item operations --------------------------------------------
    def put_item(self, Item, ConditionExpression=None, ExpressionAttributeNames=None, ExpressionAttributeValues=None, **_):
        pk, sk = self._row(Item)
        conn = _conn()
        conn.execute("BEGIN IMMEDIATE")
        try:
            if ConditionExpression is not None:
                self._check(self._fetch(conn, pk, sk), ConditionExpression, ExpressionAttributeNames, ExpressionAttributeValues, "PutItem")
            conn.execute("INSERT OR REPLACE INTO items (tbl, pk, sk, data) VALUES (?,?,?,?)", (self.name, pk, sk, _dumps(Item)))
            conn.execute("COMMIT")
        except BaseException:
            conn.execute("ROLLBACK")
            raise
        return {"ResponseMetadata": {"HTTPStatusCode": 200}}

    def _fetch(self, conn, pk, sk):
        row = conn.execute("SELECT data FROM items WHERE tbl=? AND pk=? AND sk=?", (self.name, pk, sk)).fetchone()
        return _loads(row[0]) if row else None

    def get_item(self, Key, **_):
        pk, sk = self._key_parts(Key)
        item = self._fetch(_conn(), pk, sk)
        return {"Item": item} if item is not None else {}

    def delete_item(self, Key, ConditionExpression=None, ExpressionAttributeNames=None, ExpressionAttributeValues=None, **_):
        pk, sk = self._key_parts(Key)
        conn = _conn()
        conn.execute("BEGIN IMMEDIATE")
        try:
            if ConditionExpression is not None:
                self._check(self._fetch(conn, pk, sk), ConditionExpression, ExpressionAttributeNames, ExpressionAttributeValues, "DeleteItem")
            conn.execute("DELETE FROM items WHERE tbl=? AND pk=? AND sk=?", (self.name, pk, sk))
            conn.execute("COMMIT")
        except BaseException:
            conn.execute("ROLLBACK")
            raise
        return {"ResponseMetadata": {"HTTPStatusCode": 200}}

    def update_item(self, Key, UpdateExpression, ExpressionAttributeNames=None, ExpressionAttributeValues=None,
                    ConditionExpression=None, ReturnValues="NONE", **_):
        pk, sk = self._key_parts(Key)
        names, values = ExpressionAttributeNames or {}, ExpressionAttributeValues or {}
        conn = _conn()
        conn.execute("BEGIN IMMEDIATE")
        try:
            existing = self._fetch(conn, pk, sk)
            if ConditionExpression is not None:
                self._check(existing, ConditionExpression, names, values, "UpdateItem")
            item = existing if existing is not None else dict(Key)
            _apply_update(item, UpdateExpression, names, values)
            conn.execute("INSERT OR REPLACE INTO items (tbl, pk, sk, data) VALUES (?,?,?,?)", (self.name, pk, sk, _dumps(item)))
            conn.execute("COMMIT")
        except BaseException:
            conn.execute("ROLLBACK")
            raise
        return {"Attributes": item} if ReturnValues in ("ALL_NEW", "UPDATED_NEW") else {}

    # -- multi-item operations ---------------------------------------------
    def query(self, KeyConditionExpression, IndexName=None, FilterExpression=None, ExpressionAttributeNames=None,
              ExpressionAttributeValues=None, ScanIndexForward=True, Select=None, Limit=None, **_):
        names, values = ExpressionAttributeNames, ExpressionAttributeValues
        key_cond = C.parse_condition(KeyConditionExpression, names, values)
        parts = C.flatten_and(key_cond)

        if IndexName:
            if IndexName not in self._schema["gsis"]:
                raise _client_error("ValidationException", f"The table does not have the specified index: {IndexName}", "Query")
            hash_attr = self._schema["gsis"][IndexName]
        else:
            hash_attr = self._schema["pk"]
        hash_cond = next((p for p in parts if isinstance(p, C.Cmp) and p.op == "=" and p.attr == hash_attr), None)
        if hash_cond is None:
            raise _client_error("ValidationException", f"Query condition missed key schema element: {hash_attr}", "Query")
        rest = [p for p in parts if p is not hash_cond]

        if IndexName:
            rows = _conn().execute(
                f"SELECT data FROM items WHERE tbl=? AND json_extract(data, '$.{hash_attr}') = ?", (self.name, str(hash_cond.value))
            ).fetchall()
        else:
            rows = _conn().execute("SELECT data FROM items WHERE tbl=? AND pk=? ORDER BY sk", (self.name, str(hash_cond.value))).fetchall()
        items = [_loads(r[0]) for r in rows]

        if rest:
            items = [i for i in items if all(p.matches(i) for p in rest)]
        sort_attr = self._schema["sk"]
        if sort_attr and not IndexName:
            items.sort(key=lambda i: str(i.get(sort_attr, "")), reverse=not ScanIndexForward)
        return self._finish(items, FilterExpression, names, values, Select, Limit)

    def scan(self, FilterExpression=None, ExpressionAttributeNames=None, ExpressionAttributeValues=None, Select=None, Limit=None,
             IndexName=None, **_):
        rows = _conn().execute("SELECT data FROM items WHERE tbl=?", (self.name,)).fetchall()
        items = [_loads(r[0]) for r in rows]
        return self._finish(items, FilterExpression, ExpressionAttributeNames, ExpressionAttributeValues, Select, Limit)

    @staticmethod
    def _finish(items, filter_expr, names, values, select, limit):
        cond = C.parse_condition(filter_expr, names, values)
        scanned = len(items)
        if cond is not None:
            items = [i for i in items if cond.matches(i)]
        if limit is not None:
            items = items[: int(limit)]
        out = {"Count": len(items), "ScannedCount": scanned, "ResponseMetadata": {"HTTPStatusCode": 200}}
        if select != "COUNT":
            out["Items"] = items
        return out

    def batch_writer(self):
        return _BatchWriter(self)


class _BatchWriter:
    def __init__(self, table):
        self.table = table

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def put_item(self, Item):
        self.table.put_item(Item=Item)

    def delete_item(self, Key):
        self.table.delete_item(Key=Key)


class Resource:
    """What boto3.resource('dynamodb') returns in the handlers."""

    def Table(self, name):
        return Table(name)


# -- UpdateExpression -------------------------------------------------------
_SET_ASSIGN = re.compile(r"^\s*([#\w.]+)\s*=\s*(.+?)\s*$")


def _apply_update(item, expression, names, values):
    m = re.match(r"^\s*(SET|REMOVE)\s+(.*)$", expression.strip(), re.I | re.S)
    if not m:
        raise NotImplementedError(f"UpdateExpression not supported locally: {expression!r}")
    # Split clauses: "SET a = :a, b = :b REMOVE c"  (ADD / DELETE are not used by the handlers)
    clauses = re.split(r"\b(SET|REMOVE|ADD|DELETE)\b", expression, flags=re.I)
    it = iter(clauses[1:])
    for verb, body in zip(it, it):
        verb = verb.upper()
        if verb not in ("SET", "REMOVE"):
            raise NotImplementedError(f"UpdateExpression clause {verb} not supported locally")
        for piece in _split_top_level(body):
            if verb == "REMOVE":
                _set_path(item, _name(piece.strip(), names), _REMOVE)
            else:
                am = _SET_ASSIGN.match(piece)
                if not am:
                    raise ValueError(f"cannot parse SET clause {piece!r}")
                _set_path(item, _name(am.group(1), names), _eval_operand(item, am.group(2), names, values))


_REMOVE = object()


def _split_top_level(body):
    out, depth, cur = [], 0, []
    for ch in body:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            out.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    if "".join(cur).strip():
        out.append("".join(cur))
    return out


def _name(token, names):
    return names[token] if token.startswith("#") else token


def _eval_operand(item, text, names, values):
    text = text.strip()
    if text.startswith(":"):
        return values[text]
    fm = re.match(r"^(if_not_exists|list_append)\((.*)\)$", text, re.S)
    if fm:
        a, b = [x.strip() for x in _split_top_level(fm.group(2))]
        if fm.group(1) == "if_not_exists":
            cur = C.resolve(item, _name(a, names))
            return _eval_operand(item, b, names, values) if cur is C._MISSING else cur
        return list(_eval_operand(item, a, names, values)) + list(_eval_operand(item, b, names, values))
    am = re.match(r"^(.+?)\s*([+-])\s*(.+)$", text)
    if am:
        left, right = _eval_operand(item, am.group(1), names, values), _eval_operand(item, am.group(3), names, values)
        return left + right if am.group(2) == "+" else left - right
    cur = C.resolve(item, _name(text, names))
    if cur is C._MISSING:
        raise ValueError(f"attribute {text!r} does not exist")
    return cur


def _set_path(item, path, value):
    parts = path.split(".")
    cur = item
    for p in parts[:-1]:
        cur = cur.setdefault(p, {})
    if value is _REMOVE:
        cur.pop(parts[-1], None)
    else:
        cur[parts[-1]] = value
