"""Drop-in for boto3.dynamodb.conditions (Key / Attr) plus a parser for DynamoDB expression strings.

Conditions are evaluated in Python against an item dict. SQL only narrows by the partition key
(see sqlite_table.py); tables here are small, so filtering in Python is simple and fast enough.
"""
import re
from decimal import Decimal

_MISSING = object()


def resolve(item, path):
    """Look up a (possibly dotted) attribute path; returns _MISSING when absent."""
    cur = item
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return _MISSING
    return cur


def _norm(v):
    return Decimal(str(v)) if isinstance(v, float) else v


class ConditionBase:
    def __and__(self, other):
        return And(self, other)

    def __or__(self, other):
        return Or(self, other)

    def __invert__(self):
        return Not(self)

    def matches(self, item):  # pragma: no cover
        raise NotImplementedError


class Cmp(ConditionBase):
    OPS = {
        "=": lambda a, b: a == b,
        "<>": lambda a, b: a != b,
        "<": lambda a, b: a < b,
        "<=": lambda a, b: a <= b,
        ">": lambda a, b: a > b,
        ">=": lambda a, b: a >= b,
    }

    def __init__(self, attr, op, value):
        self.attr, self.op, self.value = attr, op, value

    def matches(self, item):
        actual = resolve(item, self.attr)
        if actual is _MISSING:
            return self.op == "<>"
        try:
            return self.OPS[self.op](_norm(actual), _norm(self.value))
        except TypeError:
            return False


class Between(ConditionBase):
    def __init__(self, attr, low, high):
        self.attr, self.low, self.high = attr, low, high

    def matches(self, item):
        actual = resolve(item, self.attr)
        return actual is not _MISSING and _norm(self.low) <= _norm(actual) <= _norm(self.high)


class Func(ConditionBase):
    def __init__(self, name, attr, value=None):
        self.name, self.attr, self.value = name, attr, value

    def matches(self, item):
        actual = resolve(item, self.attr)
        if self.name == "attribute_exists":
            return actual is not _MISSING
        if self.name == "attribute_not_exists":
            return actual is _MISSING
        if actual is _MISSING:
            return False
        if self.name == "begins_with":
            return isinstance(actual, str) and actual.startswith(self.value)
        if self.name == "contains":
            return self.value in actual if isinstance(actual, (str, list, tuple, set)) else False
        if self.name == "in":
            return actual in self.value
        raise NotImplementedError(f"condition function {self.name}")


class And(ConditionBase):
    def __init__(self, *parts):
        self.parts = parts

    def matches(self, item):
        return all(p.matches(item) for p in self.parts)


class Or(ConditionBase):
    def __init__(self, *parts):
        self.parts = parts

    def matches(self, item):
        return any(p.matches(item) for p in self.parts)


class Not(ConditionBase):
    def __init__(self, inner):
        self.inner = inner

    def matches(self, item):
        return not self.inner.matches(item)


class Attr:
    def __init__(self, name):
        self.name = name

    def eq(self, v):
        return Cmp(self.name, "=", v)

    def ne(self, v):
        return Cmp(self.name, "<>", v)

    def lt(self, v):
        return Cmp(self.name, "<", v)

    def lte(self, v):
        return Cmp(self.name, "<=", v)

    def gt(self, v):
        return Cmp(self.name, ">", v)

    def gte(self, v):
        return Cmp(self.name, ">=", v)

    def between(self, low, high):
        return Between(self.name, low, high)

    def begins_with(self, v):
        return Func("begins_with", self.name, v)

    def contains(self, v):
        return Func("contains", self.name, v)

    def exists(self):
        return Func("attribute_exists", self.name)

    def not_exists(self):
        return Func("attribute_not_exists", self.name)

    def is_in(self, values):
        return Func("in", self.name, list(values))


class Key(Attr):
    """Same operators as Attr; kept as its own type to mirror boto3."""


# ---------------------------------------------------------------------------
# Expression-string parser:  "A = :a AND (#b <> :b OR begins_with(c, :c))"
# ---------------------------------------------------------------------------
_TOKEN = re.compile(r"\s*(<>|<=|>=|=|<|>|\(|\)|,|[#:]?\w[\w.]*)")


def _tokens(expr):
    pos, out = 0, []
    expr = expr.strip()
    while pos < len(expr):
        m = _TOKEN.match(expr, pos)
        if not m:
            raise ValueError(f"cannot parse expression near: {expr[pos:pos + 20]!r}")
        out.append(m.group(1))
        pos = m.end()
        while pos < len(expr) and expr[pos].isspace():
            pos += 1
    return out


class _Parser:
    def __init__(self, expr, names, values):
        self.toks, self.i = _tokens(expr), 0
        self.names, self.values = names or {}, values or {}

    def _peek(self):
        return self.toks[self.i] if self.i < len(self.toks) else None

    def _next(self):
        tok = self._peek()
        self.i += 1
        return tok

    def _expect(self, tok):
        got = self._next()
        if got != tok:
            raise ValueError(f"expected {tok!r}, got {got!r}")

    def _is(self, word):
        t = self._peek()
        return t is not None and t.upper() == word

    def parse(self):
        node = self._or()
        if self._peek() is not None:
            raise ValueError(f"unexpected token {self._peek()!r}")
        return node

    def _or(self):
        parts = [self._and()]
        while self._is("OR"):
            self._next()
            parts.append(self._and())
        return parts[0] if len(parts) == 1 else Or(*parts)

    def _and(self):
        parts = [self._not()]
        while self._is("AND"):
            self._next()
            parts.append(self._not())
        return parts[0] if len(parts) == 1 else And(*parts)

    def _not(self):
        if self._is("NOT"):
            self._next()
            return Not(self._not())
        return self._atom()

    def _name(self, tok):
        return self.names[tok] if tok.startswith("#") else tok

    def _value(self, tok):
        if not tok.startswith(":"):
            raise ValueError(f"expected a :value placeholder, got {tok!r}")
        return self.values[tok]

    def _atom(self):
        tok = self._next()
        if tok == "(":
            node = self._or()
            self._expect(")")
            return node
        if tok in ("attribute_exists", "attribute_not_exists", "begins_with", "contains") and self._peek() == "(":
            self._next()
            attr = self._name(self._next())
            value = None
            if tok in ("begins_with", "contains"):
                self._expect(",")
                value = self._value(self._next())
            self._expect(")")
            return Func(tok, attr, value)
        attr = self._name(tok)
        if self._is("BETWEEN"):
            self._next()
            low = self._value(self._next())
            if not self._is("AND"):
                raise ValueError("BETWEEN requires AND")
            self._next()
            return Between(attr, low, self._value(self._next()))
        op = self._next()
        if op not in Cmp.OPS:
            raise ValueError(f"unsupported operator {op!r}")
        return Cmp(attr, op, self._value(self._next()))


def parse_condition(expr, names=None, values=None):
    """Accepts a condition object (returned as-is) or a DynamoDB expression string."""
    if expr is None or isinstance(expr, ConditionBase):
        return expr
    return _Parser(expr, names, values).parse()


def flatten_and(cond):
    """Split a top-level AND into its parts (used to pull the key equality out of a key condition)."""
    if isinstance(cond, And):
        out = []
        for p in cond.parts:
            out.extend(flatten_and(p))
        return out
    return [cond]
