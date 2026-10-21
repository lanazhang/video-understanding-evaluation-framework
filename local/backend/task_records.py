"""Helpers for the analyze-table task records written by the local handlers."""
import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3

TABLE = os.environ.get("DYNAMO_VIDEO_ANALYZE_TABLE")


def to_decimal(obj):
    if isinstance(obj, list):
        return [to_decimal(i) for i in obj]
    if isinstance(obj, dict):
        return {k: to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, float):
        return Decimal(str(obj))
    return obj


def table():
    return boto3.resource("dynamodb").Table(TABLE)


def get_task(task_id, task_type):
    return table().get_item(Key={"Id": task_id, "Type": task_type}).get("Item")


def update_task(task_id, task_type, status=None, result=None, finished=False):
    """Merge `result` into Result; with finished=True also stamps CompletedTs and ProcessingTimeS."""
    item = get_task(task_id, task_type)
    if not item:
        return None
    if status:
        item["Status"] = status
    res = item.setdefault("Result", {})
    res.update(result or {})
    if finished:
        now = datetime.now(timezone.utc)
        item["CompletedTs"] = now.isoformat()
        if item.get("StartedTs"):
            started = datetime.fromisoformat(item["StartedTs"].replace("Z", "+00:00"))
            res["ProcessingTimeS"] = (now - started).total_seconds()
    table().put_item(Item=to_decimal(item))
    return item
