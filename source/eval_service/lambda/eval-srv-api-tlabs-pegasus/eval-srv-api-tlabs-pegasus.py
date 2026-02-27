import json
import boto3
import os
import time
from datetime import datetime, timezone
from decimal import Decimal

DYNAMO_VIDEO_TABLE = os.environ.get("DYNAMO_VIDEO_TABLE")
DYNAMO_VIDEO_ANALYZE_TABLE = os.environ.get("DYNAMO_VIDEO_ANALYZE_TABLE")
DEFAULT_TLABS_PEGASUS_MODEL_ID = os.environ.get("DEFAULT_TLABS_PEGASUS_MODEL_ID", "twelvelabs.pegasus-1-0-v1:0")

# Retry configuration
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds

# CORS headers for all responses
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
}

bedrock = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')
sts = boto3.client("sts")

video_table = dynamodb.Table(DYNAMO_VIDEO_TABLE)
analyze_table = dynamodb.Table(DYNAMO_VIDEO_ANALYZE_TABLE) if DYNAMO_VIDEO_ANALYZE_TABLE else None

def retry_with_backoff(func, max_retries=MAX_RETRIES, delay=RETRY_DELAY):
    """
    Retry a function with exponential backoff
    """
    for attempt in range(max_retries):
        try:
            return func()
        except Exception as e:
            if attempt == max_retries - 1:
                # Last attempt failed, raise the exception
                raise
            print(f"Attempt {attempt + 1} failed: {str(e)}")
            wait_time = delay * (2 ** attempt)  # Exponential backoff
            print(f"Retrying in {wait_time} seconds...")
            time.sleep(wait_time)

def convert_floats_to_decimal(obj):
    """Convert float values to Decimal for DynamoDB compatibility"""
    if isinstance(obj, list):
        return [convert_floats_to_decimal(item) for item in obj]
    elif isinstance(obj, dict):
        return {key: convert_floats_to_decimal(value) for key, value in obj.items()}
    elif isinstance(obj, float):
        return Decimal(str(obj))
    return obj

def lambda_handler(event, context):
    """
    Start TwelveLabs Pegasus video understanding analysis task
    This lambda is called by the video understanding orchestrator lambda
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
        input_prompt = body.get("InputPrompt") or body.get("inputPrompt") or body.get("input_prompt")
        
        if not video_id:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Missing required field: VideoId or video_id'})
            }
        
        if not input_prompt:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Missing required field: InputPrompt or inputPrompt'})
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
        
        # Get parameters with defaults - accept both naming conventions
        model_id = body.get("ModelId") or body.get("model_id") or DEFAULT_TLABS_PEGASUS_MODEL_ID
        temperature = body.get("Temperature") or body.get("temperature") or 0
        tool_config = body.get("ToolConfig") or body.get("tool_config")
        response_format = body.get("ResponseFormat") or body.get("response_format")  # Direct response format
        task_id = body.get("TaskId") or body.get("task_id")  # Task ID for updating DynamoDB
        
        # Get AWS account ID
        account_id = sts.get_caller_identity()["Account"]
        
        # Build TwelveLabs Pegasus request
        pegasus_request = {
            "inputPrompt": input_prompt,
            "mediaSource": {
                "s3Location": {
                    "uri": f's3://{s3_bucket}/{s3_key}',
                    "bucketOwner": account_id
                }
            },
            "temperature": temperature
        }
        
        # Add responseFormat - check both direct parameter and tool_config
        if response_format:
            pegasus_request["responseFormat"] = response_format
            print(f"Using response format from direct parameter: {json.dumps(response_format)}")
        elif tool_config and "responseFormat" in tool_config:
            pegasus_request["responseFormat"] = tool_config["responseFormat"]
            print(f"Using response format from tool_config: {json.dumps(tool_config['responseFormat'])}")
        else:
            # Even without explicit format, request JSON output with default structure
            pegasus_request["responseFormat"] = {
                "type": "json",
                "schema": {
                    "type": "object",
                    "properties": {
                        "summary": {
                            "type": "string",
                            "description": "A high-level summary of the entire video content"
                        },
                        "scenes": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "start_time": {
                                        "type": "string",
                                        "description": "Start timestamp in format MM:SS or HH:MM:SS"
                                    },
                                    "end_time": {
                                        "type": "string",
                                        "description": "End timestamp in format MM:SS or HH:MM:SS"
                                    },
                                    "description": {
                                        "type": "string",
                                        "description": "Description of what happens in this scene"
                                    }
                                },
                                "required": ["start_time", "end_time", "description"]
                            }
                        }
                    },
                    "required": ["summary", "scenes"]
                }
            }
            print("Using default JSON response format")
        
        # Invoke Bedrock model synchronously
        print(f"Starting TwelveLabs Pegasus task with model: {model_id}")
        print(f"Request: {json.dumps(pegasus_request)}")
        
        # Wrap the API call with retry logic
        def invoke_model_with_retry():
            return bedrock.invoke_model(
                modelId=model_id,
                body=json.dumps(pegasus_request)
            )
        
        bedrock_response = retry_with_backoff(invoke_model_with_retry)
        
        # Parse response
        response_body = json.loads(bedrock_response['body'].read())
        print(f"Bedrock response: {json.dumps(response_body)}")
        
        # Update DynamoDB task record if task_id is provided
        if task_id and analyze_table:
            try:
                completed_timestamp = datetime.now(timezone.utc).isoformat()
                
                # Get the task item
                task_response = analyze_table.get_item(Key={'Id': task_id, 'Type': 'video-understanding'})
                if 'Item' in task_response:
                    task_item = task_response['Item']
                    
                    # Update Result section
                    task_item['CompletedTs'] = completed_timestamp
                    task_item['Status'] = 'completed'
                    task_item['Result']['Response'] = response_body.get('message', '')
                    
                    # Add response metadata if available
                    if 'stopReason' in response_body:
                        task_item['Result']['ResponseMetadata'] = {
                            'stopReason': response_body.get('stopReason', 'unknown')
                        }
                    
                    # Calculate processing time
                    from dateutil import parser
                    started = parser.isoparse(task_item['StartedTs'])
                    completed = parser.isoparse(completed_timestamp)
                    processing_time = (completed - started).total_seconds()
                    task_item['Result']['ProcessingTimeS'] = processing_time
                    
                    # Convert floats to Decimal
                    task_item = convert_floats_to_decimal(task_item)
                    
                    # Save updated task
                    analyze_table.put_item(Item=task_item)
                    print(f"Updated task {task_id} in DynamoDB with status: completed")
            except Exception as db_error:
                print(f"Error updating DynamoDB: {str(db_error)}")
                # Don't fail the lambda if DB update fails
        
        # Return response - task record is managed by the calling lambda (start-video-understanding)
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'video_id': video_id,
                'status': 'completed',
                'response': response_body,
                'message': 'TwelveLabs Pegasus video understanding analysis completed successfully'
            })
        }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        
        # Update DynamoDB task record to failed if task_id is provided
        if 'task_id' in locals() and task_id and analyze_table:
            try:
                completed_timestamp = datetime.now(timezone.utc).isoformat()
                task_response = analyze_table.get_item(Key={'Id': task_id, 'Type': 'video-understanding'})
                if 'Item' in task_response:
                    task_item = task_response['Item']
                    task_item['CompletedTs'] = completed_timestamp
                    task_item['Status'] = 'failed'
                    task_item['Result']['ErrorMessage'] = str(e)
                    
                    task_item = convert_floats_to_decimal(task_item)
                    analyze_table.put_item(Item=task_item)
                    print(f"Updated task {task_id} in DynamoDB with status: failed")
            except Exception as db_error:
                print(f"Error updating DynamoDB on failure: {str(db_error)}")
        
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)})
        }
