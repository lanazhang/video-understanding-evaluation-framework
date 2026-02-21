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
        
        # Parse body
        body = event if isinstance(event, dict) else json.loads(event)
        
        # Validate required fields
        video_id = body.get("video_id")
        if not video_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing required field: video_id'})
            }
        
        # Get video details from video table
        video_response = video_table.get_item(Key={'Id': video_id})
        if 'Item' not in video_response:
            return {
                'statusCode': 404,
                'body': json.dumps({'error': f'Video not found: {video_id}'})
            }
        
        video_item = video_response['Item']
        s3_bucket = video_item.get('s3_bucket')
        s3_key = video_item.get('s3_key_video')
        
        if not s3_bucket or not s3_key:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Video S3 location not found'})
            }
        
        # Generate task ID
        task_id = str(uuid.uuid4())
        
        # Get parameters with defaults
        model_id = body.get("model_id", DEFAULT_NOVA_MME_MODEL_ID)
        embed_mode = body.get("embed_mode", "AUDIO_VIDEO_COMBINED")
        duration_s = int(body.get("duration_s", 5))
        requested_by = body.get("requested_by", "unknown")
        
        # Determine video format
        video_format = s3_key.split("/")[-1].split(".")[-1].lower()
        
        # Define S3 output prefix
        s3_prefix_output = f'tasks/{video_id}/nova-mme/{task_id}/'
        
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
                "embeddingDimension": EMBEDDING_DIM,
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
        
        # Store analysis record to DynamoDB
        timestamp = datetime.now(timezone.utc).isoformat()
        analyze_item = {
            "Id": task_id,
            "type": "nova-mme",
            "video_id": video_id,
            "video_name": video_item.get('name', ''),
            "status": "processing",
            "model_id": model_id,
            "embed_mode": embed_mode,
            "duration_s": duration_s,
            "embedding_dim": EMBEDDING_DIM,
            "invocation_arn": invocation_arn,
            "s3_bucket": s3_bucket,
            "s3_output_prefix": s3_prefix_output,
            "requested_by": requested_by,
            "requested_ts": timestamp,
            "request_params": body
        }
        
        print(f"Storing analysis record: {json.dumps(analyze_item, default=str)}")
        analyze_table.put_item(Item=analyze_item)
        
        return {
            'statusCode': 200,
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
            'body': json.dumps({'error': str(e)})
        }
