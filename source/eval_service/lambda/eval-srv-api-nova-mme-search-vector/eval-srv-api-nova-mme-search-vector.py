import json
import boto3
import os
import re
from urllib.parse import urlparse
import utils
import uuid
import time
import base64
from decimal import Decimal

S3_PRESIGNED_URL_EXPIRY_S = os.environ.get("S3_PRESIGNED_URL_EXPIRY_S", 3600)  # Default 1 hour
S3_BUCKET_DATA = os.environ.get("S3_BUCKET_DATA")
DYNAMO_VIDEO_TASK_TABLE = os.environ.get("DYNAMO_VIDEO_TASK_TABLE")
MODEL_ID = os.environ.get("MODEL_ID")
NOVA_S3_VECTOR_BUCKET = os.environ.get("NOVA_S3_VECTOR_BUCKET")
NOVA_S3_VECTOR_INDEX = os.environ.get("NOVA_S3_VECTOR_INDEX")
EMBEDDING_DIM = os.environ.get("EMBEDDING_DIM")
EMBEDDING_DIM = int(EMBEDDING_DIM) if EMBEDDING_DIM else 1024

s3 = boto3.client('s3')
bedrock = boto3.client('bedrock-runtime')
s3vectors = boto3.client('s3vectors')


# Custom JSON encoder to handle Decimal types from DynamoDB
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)


def lambda_handler(event, context):
    try:
        # Parse body if it's a string (API Gateway format)
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event
        
        video_id = body.get("VideoId")
        task_id = body.get("TaskId")
        search_text = body.get("SearchText", "")
        page_size = body.get("PageSize", 10)
        from_index = body.get("FromIndex", 0)
        request_by = body.get("RequestBy")
        input_bytes = body.get("InputBytes", "")
        input_format = body.get("InputFormat", "")
        source = body.get("Source")
        input_type = body.get("InputType")
        TOP_K = body.get("TopK", 5)
        include_video_url = body.get("IncludeVideoUrl", True)
        embedding_options = body.get("EmbeddingOptions", ["audio-video", "video", "audio"])
        
        # Validate required parameters
        if not task_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'TaskId is required'})
            }
        
        if search_text is None:
            search_text = ""
        if input_bytes is None:
            input_bytes = ""
        
        if len(search_text) > 0:
            search_text = search_text.strip()
        
        if not search_text and not input_bytes:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'SearchText or InputBytes is required'})
            }
        
        # Get task information from DynamoDB to retrieve S3 vector bucket and index
        s3_vector_bucket = NOVA_S3_VECTOR_BUCKET
        s3_vector_index = NOVA_S3_VECTOR_INDEX
        embedding_dim = EMBEDDING_DIM  # Default value
        
        # Query by specific task ID
        # Note: The table has composite key (Id + Type), so we need to query with both
        task = utils.dynamodb_get_by_composite_key(DYNAMO_VIDEO_TASK_TABLE, task_id, "nova-mme")
        if not task:
            return {
                'statusCode': 404,
                'body': json.dumps({'error': f'Task not found: {task_id}'})
            }
        
        # Extract S3 vector info and embedding dimension from task
        if task.get("Result"):
            s3_vector_bucket = task["Result"].get("S3VectorBucket", s3_vector_bucket)
            s3_vector_index = task["Result"].get("S3VectorIndex", s3_vector_index)
        
        if task.get("Request"):
            # Convert Decimal to int for embedding dimension
            embedding_dim_value = task["Request"].get("EmbeddingDim", embedding_dim)
            embedding_dim = int(embedding_dim_value) if embedding_dim_value else embedding_dim
        
        if not s3_vector_bucket or not s3_vector_index:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'S3 vector bucket or index not found in task result'})
            }
        
        # Generate embedding for search input using the task's embedding dimension
        input_embedding = embed_input(input_type, search_text, input_bytes, input_format, embedding_dim)
        
        if not input_embedding:
            return {
                'statusCode': 500,
                'body': json.dumps({'error': 'Failed to generate input embedding'})
            }
        
        # Search embeddings
        clips = search_embedding_s3vectors(input_embedding, s3_vector_bucket, s3_vector_index, TOP_K, embedding_options)
        
        result = []
        if clips:
            tid, clip_task = None, None
            if clips:
                tid = clips[0].get("key").split("_")[0]
                if tid:
                    clip_task = utils.dynamodb_get_by_composite_key(DYNAMO_VIDEO_TASK_TABLE, tid, "nova-mme")

            for clip in clips:
                # Query with composite key (Id + Type='nova-mme')
                if clip_task:
                    metadata = clip.get("metadata", {})
                    
                    # Get S3 key from metadata, or construct it if not available
                    s3_key = metadata.get("s3_key")
                    if not s3_key:
                        # Construct S3 key for backward compatibility with old embeddings
                        video_id = metadata.get("video_id") or clip_task.get("VideoId")
                        start_sec = metadata.get("startSec", "0")
                        end_sec = metadata.get("endSec", "0")
                        embedding_option = metadata.get("embeddingOption", "unknown")
                        task_id_for_path = metadata.get("task_id") or task_id
                        s3_key = f'tasks/{video_id}/video-analyze/{task_id_for_path}/clips/{embedding_option}_{start_sec}_{end_sec}.mp4'
                    
                    item = {
                        "TaskId": tid,
                        "VideoId": clip_task.get("VideoId"),
                        "StartSec": metadata.get("startSec"),
                        "EndSec": metadata.get("endSec"),
                        "EmbeddingOption": metadata.get("embeddingOption"),
                        "Distance": clip["distance"],
                        "Status": clip_task.get("Status"),
                        "S3Bucket": clip_task.get("Result", {}).get("S3BucketResult"),
                        "S3Key": s3_key
                    }
                    result.append(item)
        
        # Pagination
        from_index = from_index if from_index > 0 else 0
        end_index = from_index + page_size if from_index + page_size < len(result) else len(result)
        result = result[from_index: end_index]
        
        # Get S3 presigned URL
        if include_video_url:
            for item in result:
                s3_bucket = item.get("S3Bucket")
                s3_key = item.get("S3Key")
                if s3_bucket and s3_key:
                    try:
                        item["VideoUrl"] = s3.generate_presigned_url(
                            'get_object',
                            Params={'Bucket': s3_bucket, 'Key': s3_key},
                            ExpiresIn=S3_PRESIGNED_URL_EXPIRY_S
                        )
                    except Exception as e:
                        print(f"Error generating presigned URL: {e}")
        
        return {
            'statusCode': 200,
            'body': json.dumps(result, cls=DecimalEncoder)
        }
    
    except Exception as e:
        print(f"Error in lambda_handler: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }


def embed_input(input_type, input_text, input_bytes, input_format, embedding_dim, model_id=MODEL_ID):
    request_body = None
    if input_type == "text":
        request_body = {
            "schemaVersion": "nova-multimodal-embed-v1",
            "taskType": "SINGLE_EMBEDDING",
            "singleEmbeddingParams": {
                "embeddingPurpose": "VIDEO_RETRIEVAL",
                "embeddingDimension": embedding_dim,
                "text": {
                    "truncationMode": "NONE",
                    "value": input_text,
                }
            }
        }
    elif input_type == "image" and input_bytes:
        request_body = {
            "schemaVersion": "nova-multimodal-embed-v1",
            "taskType": "SINGLE_EMBEDDING",
            "singleEmbeddingParams": {
                "embeddingPurpose": "VIDEO_RETRIEVAL",
                "embeddingDimension": embedding_dim,
                "image": {
                    "detailLevel": "DOCUMENT_IMAGE",
                    "format": input_format,
                    "source": {
                        "bytes": input_bytes
                    },
                }
            }
        }
    
    # Invoke the Nova Embeddings model.
    response = bedrock.invoke_model(
        body=json.dumps(request_body),
        modelId=model_id,
        accept="application/json",
        contentType="application/json",
    )
    
    # Decode the response body.
    response_body = json.loads(response.get("body").read())
    response_metadata = response["ResponseMetadata"]
    
    return response_body["embeddings"][0]["embedding"]


def search_embedding_s3vectors(input_embedding, s3vector_bucket, s3vector_index, top_k, embedding_options):
    # Query vector index.
    response = s3vectors.query_vectors(
        vectorBucketName=s3vector_bucket,
        indexName=s3vector_index,
        queryVector={"float32": input_embedding},
        topK=top_k,
        returnDistance=True,
        returnMetadata=True,
        filter={"embeddingOption": {"$in": embedding_options}}
    )
    
    return response["vectors"]
