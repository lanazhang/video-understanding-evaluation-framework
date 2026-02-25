import json
import boto3
import uuid
import os
import botocore
from datetime import datetime, timezone

DYNAMO_VIDEO_ANALYZE_TABLE = os.environ.get("DYNAMO_VIDEO_ANALYZE_TABLE")
DYNAMO_VIDEO_TABLE = os.environ.get("DYNAMO_VIDEO_TABLE")
EMBEDDING_DIM = os.environ.get("EMBEDDING_DIM")
DEFAULT_NOVA_MME_MODEL_ID = os.environ.get("DEFAULT_NOVA_MME_MODEL_ID")

EMBEDDING_DIM = int(EMBEDDING_DIM) if EMBEDDING_DIM else 1024

# CORS headers for all responses
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
}

bedrock = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')
s3 = boto3.client("s3")

analyze_table = dynamodb.Table(DYNAMO_VIDEO_ANALYZE_TABLE)
video_table = dynamodb.Table(DYNAMO_VIDEO_TABLE)

def lambda_handler(event, context):
    """
    Start Nova MME (Multimodal Embedding) analysis task for a video
    """
    try:
        print(f"Received event: {json.dumps(event)}")
        
        # Parse body - handle both API Gateway and direct invocation
        if 'body' in event:
            # API Gateway proxy integration
            body = event['body']
            if isinstance(body, str):
                body = json.loads(body)
        else:
            # Direct invocation
            body = event
            if isinstance(body, str):
                body = json.loads(body)
        
        print(f"Parsed body: {json.dumps(body)}")
        
        # Validate required fields - accept both snake_case (API) and PascalCase (internal)
        video_id = body.get("VideoId") or body.get("video_id")
        if not video_id:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Missing required field: VideoId or video_id'})
            }
        
        # Get video details from video table
        video_response = video_table.get_item(Key={'Id': video_id})
        if 'Item' not in video_response:
            return {
                'statusCode': 404,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': f'Video not found: {video_id}'})
            }
        
        video_item = video_response['Item']
        s3_bucket = video_item.get('S3Bucket')
        s3_key = video_item.get('S3KeyVideo')
        
        if not s3_bucket or not s3_key:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Video S3 location not found'})
            }
        
        # Generate task ID
        task_id = str(uuid.uuid4())
        
        # Get parameters with defaults - accept both naming conventions
        model_id = body.get("ModelId") or body.get("model_id") or DEFAULT_NOVA_MME_MODEL_ID
        description = body.get("Description") or body.get("description") or ""
        
        # Request parameters - accept both naming conventions
        request_params = body.get("Request", {})
        duration_s = int(request_params.get("DurationS") or body.get("duration_s") or 5)
        embed_mode = request_params.get("EmbedMode") or body.get("embed_mode") or "AUDIO_VIDEO_COMBINED"
        embedding_dim = int(request_params.get("EmbeddingDim") or body.get("embedding_dim") or EMBEDDING_DIM)
        requested_by = request_params.get("RequestedBy") or body.get("requested_by") or "unknown"
        
        # Determine video format
        video_format = s3_key.split("/")[-1].split(".")[-1].lower()
        
        # Define S3 output prefix
        s3_prefix_output = f'tasks/{video_id}/video-analyze/nova-mme/{task_id}/'
        
        # Create output folder placeholder (workaround before Nova fix output support prefix)
        tmp_key = s3_prefix_output + ".tmp"
        try:
            s3.head_object(Bucket=s3_bucket, Key=tmp_key)
            print(f"Folder already exists: s3://{s3_bucket}/{tmp_key}")
        except botocore.exceptions.ClientError as e:
            if e.response["Error"]["Code"] == "404":
                s3.put_object(Bucket=s3_bucket, Key=tmp_key, Body=b"")
                print(f"Created folder: s3://{s3_bucket}/{tmp_key}")
        
        # Prepare Bedrock request
        request = {
            "taskType": "SEGMENTED_EMBEDDING",
            "segmentedEmbeddingParams": {
                "embeddingDimension": embedding_dim,
                "embeddingPurpose": "GENERIC_INDEX",
                "video": {
                    "format": video_format,
                    "embeddingMode": embed_mode,
                    "source": {
                        "s3Location": {
                            "uri": f's3://{s3_bucket}/{s3_key}',
                        }
                    },
                    "segmentationConfig": {
                        "durationSeconds": duration_s
                    },
                },
            },
        }
        
        # Start Nova MME async task
        print(f"Starting Nova MME task with model: {model_id}")
        bedrock_response = bedrock.start_async_invoke(
            modelId=model_id,
            modelInput=request,
            outputDataConfig={
                "s3OutputDataConfig": {
                    "s3Uri": f's3://{s3_bucket}/{s3_prefix_output}'
                }
            }
        )
        
        invocation_arn = bedrock_response["invocationArn"]
        print(f"Task ARN: {invocation_arn}")
        
        # Store analysis record to DynamoDB using new schema
        timestamp = datetime.now(timezone.utc).isoformat()
        analyze_item = {
            "Id": task_id,
            "Type": "nova-mme",
            "VideoId": video_id,
            "Description": description,
            "ModelId": model_id,
            "StartedTs": timestamp,
            "Status": "processing",
            "Request": {
                "DurationS": duration_s,
                "EmbedMode": embed_mode,
                "EmbeddingDim": embedding_dim,
            },
            "Result": {
                "S3BucketResult": s3_bucket,
                "S3OutputPrefix": s3_prefix_output
            }
        }
        
        print(f"Storing analysis record: {json.dumps(analyze_item, default=str)}")
        analyze_table.put_item(Item=analyze_item)
        
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'task_id': task_id,
                'video_id': video_id,
                'invocation_arn': invocation_arn,
                'status': 'processing',
                'message': 'Nova MME analysis task started successfully'
            })
        }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)})
        }
