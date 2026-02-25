import json
import boto3
import uuid
import os
from datetime import datetime, timezone

DYNAMO_VIDEO_ANALYZE_TABLE = os.environ.get("DYNAMO_VIDEO_ANALYZE_TABLE")
DYNAMO_VIDEO_TABLE = os.environ.get("DYNAMO_VIDEO_TABLE")
DEFAULT_TLABS_MME_MODEL_ID = os.environ.get("DEFAULT_TLABS_MME_MODEL_ID")

# CORS headers for all responses
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
}

bedrock = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')
sts = boto3.client("sts")

analyze_table = dynamodb.Table(DYNAMO_VIDEO_ANALYZE_TABLE)
video_table = dynamodb.Table(DYNAMO_VIDEO_TABLE)

def lambda_handler(event, context):
    """
    Start TwelveLabs MME (Multimodal Embedding) analysis task for a video
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
        model_id = body.get("ModelId") or body.get("model_id") or DEFAULT_TLABS_MME_MODEL_ID
        description = body.get("Description") or body.get("description") or ""
        
        # Request parameters - accept both naming conventions
        request_params = body.get("Request", {})
        
        # Get AWS account ID
        account_id = sts.get_caller_identity()["Account"]
        
        # Define S3 output prefix
        s3_prefix_output = f'tasks/{video_id}/video-analyze/tlabs/{task_id}/'
        
        # Build TwelveLabs request based on model version
        if "twelvelabs.marengo-embed-3-0-v1:0" in model_id:
            # Marengo 3.0 format
            tlabs_request = {
                "inputType": "video",
                "video": {
                    "mediaSource": {
                        "s3Location": {
                            "uri": f's3://{s3_bucket}/{s3_key}',
                            "bucketOwner": account_id
                        }
                    }
                }
            }
            
            # Add segmentation config
            segmentation = request_params.get("segmentation", {})
            if segmentation:
                print(f"Original segmentation: {json.dumps(segmentation)}")
                # Ensure proper types for segmentation parameters
                converted_segmentation = {}
                
                # Copy the method field if present
                if "method" in segmentation:
                    converted_segmentation["method"] = segmentation["method"]
                
                # Handle dynamic segmentation
                if "dynamic" in segmentation:
                    converted_segmentation["dynamic"] = {}
                    dynamic_config = segmentation["dynamic"]
                    if "minDurationSec" in dynamic_config:
                        min_dur = int(dynamic_config["minDurationSec"])
                        converted_segmentation["dynamic"]["minDurationSec"] = min_dur
                        print(f"Converted minDurationSec: {min_dur} (type: {type(min_dur)})")
                    if "maxDurationSec" in dynamic_config:
                        max_dur = int(dynamic_config["maxDurationSec"])
                        converted_segmentation["dynamic"]["maxDurationSec"] = max_dur
                        print(f"Converted maxDurationSec: {max_dur} (type: {type(max_dur)})")
                
                # Handle fixed segmentation
                if "fixed" in segmentation:
                    converted_segmentation["fixed"] = {}
                    fixed_config = segmentation["fixed"]
                    if "durationSec" in fixed_config:
                        dur = int(fixed_config["durationSec"])
                        converted_segmentation["fixed"]["durationSec"] = dur
                        print(f"Converted durationSec: {dur} (type: {type(dur)})")
                
                if converted_segmentation:
                    tlabs_request["video"]["segmentation"] = converted_segmentation
                    print(f"Final segmentation: {json.dumps(converted_segmentation)}")
            
            # Add embedding scope
            embedding_scope = request_params.get("embeddingScope", ["clip"])
            if embedding_scope:
                tlabs_request["video"]["embeddingScope"] = embedding_scope
            
            # Add embedding options
            embedding_option = request_params.get("embeddingOption", ["visual", "audio", "transcription"])
            if embedding_option:
                tlabs_request["video"]["embeddingOption"] = embedding_option
        else:
            # Marengo 2.7 format
            tlabs_request = {
                "inputType": "video",
                "mediaSource": {
                    "s3Location": {
                        "uri": f's3://{s3_bucket}/{s3_key}',
                        "bucketOwner": account_id
                    }
                }
            }
            
            # Add optional parameters for 2.7
            if "startSec" in request_params:
                tlabs_request["startSec"] = float(request_params["startSec"])
            if "lengthSec" in request_params:
                tlabs_request["lengthSec"] = float(request_params["lengthSec"])
            if "useFixedLengthSec" in request_params:
                tlabs_request["useFixedLengthSec"] = float(request_params["useFixedLengthSec"])
            if "minClipSec" in request_params:
                tlabs_request["minClipSec"] = int(request_params["minClipSec"])
        
        # Start TwelveLabs async task
        print(f"Starting TwelveLabs MME task with model: {model_id}")
        print(f"Request: {json.dumps(tlabs_request)}")
        
        bedrock_response = bedrock.start_async_invoke(
            modelId=model_id,
            modelInput=tlabs_request,
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
            "Type": "tlabs-mme",
            "VideoId": video_id,
            "Description": description,
            "ModelId": model_id,
            "StartedTs": timestamp,
            "Status": "processing",
            "Request": request_params,
            "Result": {
                "S3BucketResult": s3_bucket,
                "S3OutputPrefix": s3_prefix_output,
                "InvocationArn": invocation_arn
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
                'message': 'TwelveLabs MME analysis task started successfully'
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
