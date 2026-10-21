"""Table definitions, mirroring deploy_dynamodb() in deployment/eval_service/eval_service_stack.py.

The usage table is not defined in the repo; its handlers write items keyed by lowercase "id".
"""
import os

from .sqlite_table import init_db, register_table
from .vectors import init_vectors


def register_all():
    register_table(os.environ["DYNAMO_VIDEO_TABLE"], "Id", gsis={"RequestBy-index": "RequestBy"})
    register_table(os.environ["DYNAMO_VIDEO_ANALYZE_TABLE"], "Id", "Type", gsis={"VideoId-index": "VideoId"})
    register_table(os.environ["DYNAMO_GROUND_TRUTH_TABLE"], "Id", gsis={"VideoId-index": "VideoId"})
    register_table(
        os.environ["DYNAMO_EVALUATION_TASK_TABLE"], "Id",
        gsis={"GroundTruthId-index": "GroundTruthId", "VideoId-index": "VideoId"},
    )
    register_table(os.environ["DYNAMO_VIDEO_USAGE_TABLE"], "id")


def setup():
    register_all()
    init_db()
    init_vectors()
