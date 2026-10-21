"""Environment for running the Lambda handlers locally.

Every Lambda in the CDK stack received its own environment variables. Locally all
handlers share one process, so the union of those variables is set once here.
Must be imported before any handler module is loaded (handlers read os.environ at import).
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Handlers are loaded straight from source/; don't litter their directories with bytecode
sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[2]
LAMBDA_DIR = ROOT / "source" / "eval_service" / "lambda"
BACKEND_DIR = Path(__file__).resolve().parent
LOCAL_HANDLERS_DIR = BACKEND_DIR / "local_handlers"

# Shared local packages (providers/, store/) must be importable from inside handlers
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

load_dotenv(ROOT / "local" / ".env")

# Name prefix the CDK stack added to deployed function names (LAMBDA_NAME_PREFIX).
LAMBDA_NAME_PREFIX = "bedrock-video-"

_bucket = os.environ.get("S3_BUCKET", "video-eval-local")

_defaults = {
    "AWS_DEFAULT_REGION": "us-east-1",
    "AWS_REGION": os.environ.get("AWS_DEFAULT_REGION", "us-east-1"),
    # S3
    "VIDEO_UPLOAD_S3_BUCKET": _bucket,
    "VIDEO_UPLOAD_S3_PREFIX": "upload",
    "S3_BUCKET_DATA": _bucket,
    "S3_PRESIGNED_URL_EXPIRY_S": "3600",
    # DynamoDB
    "DYNAMO_VIDEO_TABLE": "bedrock_video_eval_video",
    "DYNAMO_VIDEO_ANALYZE_TABLE": "bedrock_video_eval_analyze_table",
    "DYNAMO_VIDEO_TASK_TABLE": os.environ.get("DYNAMO_VIDEO_ANALYZE_TABLE", "bedrock_video_eval_analyze_table"),
    "DYNAMO_GROUND_TRUTH_TABLE": "bedrock_video_eval_ground_truth",
    "DYNAMO_EVALUATION_TASK_TABLE": "bedrock_video_eval_evaluation_task",
    "DYNAMO_VIDEO_USAGE_TABLE": "video_eval_usage",
    # Handler-to-handler invocation targets (resolved by local_aws.LocalLambdaClient)
    "METADATA_LAMBDA_NAME": "eval-srv-get-video-metadata",
    "NOVA_MME_LAMBDA_NAME": "eval-srv-api-start-nova-mme",
    "TLABS_MME_LAMBDA_NAME": "eval-srv-api-start-tlabs-mme",
    "EMBED_LAMBDA_NAME": "eval-srv-api-start-embedding",
    "EMBED_WORKER_LAMBDA": "eval-srv-wf-embed-video",
    "LAMBDA_BEDROCK_CONVERSE": "eval-srv-api-bedrock-converse",
    "LAMBDA_TLABS_PEGASUS": "eval-srv-api-tlabs-pegasus",
    "LAMBDA_GEMINI": "eval-srv-api-gemini",
    "LAMBDA_OPENAI_COMPAT": "eval-srv-api-openai-compat",
    # Vector store (placeholder names; backing store is replaced in a later step)
    "S3_VECTOR_BUCKET": "video-eval-vector-bucket",
    "NOVA_S3_VECTOR_BUCKET": "video-eval-vector-bucket",
    "TLABS_S3_VECTOR_BUCKET": "video-eval-vector-bucket",
    "S3_VECTOR_INDEX": "nova-mme-video-clip-1024",
    "NOVA_S3_VECTOR_INDEX": "nova-mme-video-async-1024",
    "TLABS_S3_VECTOR_INDEX": "tlabs-mme-video-512",
    "TLABS_S3_VECTOR_INDEX_30": "tlabs-mme-3-0-video-512",
    "EMBEDDING_DIM": "1024",
    # Default model ids (will move to the provider registry)
    "MODEL_ID": "amazon.nova-2-multimodal-embeddings-v1:0",
    "MODEL_ID_BEDROCK_MME": "amazon.nova-2-multimodal-embeddings-v1:0",
    "DEFAULT_NOVA_MME_MODEL_ID": "amazon.nova-2-multimodal-embeddings-v1:0",
    "DEFAULT_TLABS_MME_MODEL_ID": "twelvelabs.marengo-embed-3-0-v1:0",
    "MODEL_ID_TLAB_27": "twelvelabs.marengo-embed-2-7-v1:0",
    "MODEL_ID_TLAB_30": "twelvelabs.marengo-embed-3-0-v1:0",
    "DEFAULT_TLABS_PEGASUS_MODEL_ID": "twelvelabs.pegasus-1-0-v1:0",
    "DEFAULT_BEDROCK_CONVERSE_MODEL_ID": "amazon.nova-pro-v1:0",
    "DEFAULT_GEMINI_MODEL_ID": "gemini-1.5-flash",
    "MODEL_ID_IMAGE_UNDERSTANDING": "amazon.nova-lite-v1:0",
    "THUMBNAIL_CHECK": "local",  # pixel check instead of a Bedrock call
}

for _key, _value in _defaults.items():
    os.environ.setdefault(_key, _value)

# Handlers that still talk to Bedrock/Gemini need a region even when only local endpoints are set.
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")

BUCKET = os.environ["S3_BUCKET_DATA"]
