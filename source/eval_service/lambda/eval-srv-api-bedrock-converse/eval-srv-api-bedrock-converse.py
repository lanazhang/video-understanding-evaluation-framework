import json
import boto3
from botocore.config import Config
import os
import time
from datetime import datetime, timezone
from decimal import Decimal

DYNAMO_VIDEO_TABLE = os.environ.get("DYNAMO_VIDEO_TABLE")
DYNAMO_VIDEO_ANALYZE_TABLE = os.environ.get("DYNAMO_VIDEO_ANALYZE_TABLE")
DEFAULT_BEDROCK_CONVERSE_MODEL_ID = os.environ.get("DEFAULT_BEDROCK_CONVERSE_MODEL_ID", "us.amazon.nova-pro-v1:0")

# Retry configuration
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds

# CORS headers for all responses
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
}

# Configure boto3 with extended timeouts for large video processing
boto_config = Config(
    read_timeout=900,  # 15 minutes
    connect_timeout=60,
    retries={'max_attempts': 3, 'mode': 'adaptive'}
)

bedrock_runtime = boto3.client('bedrock-runtime', config=boto_config)
dynamodb = boto3.resource('dynamodb')

# Initialize tables lazily to avoid errors during import
video_table = None
analyze_table = None

def get_video_table():
    """Lazy initialization of video table"""
    global video_table
    if video_table is None:
        if not DYNAMO_VIDEO_TABLE:
            raise ValueError("DYNAMO_VIDEO_TABLE environment variable not set")
        video_table = dynamodb.Table(DYNAMO_VIDEO_TABLE)
    return video_table

def get_analyze_table():
    """Lazy initialization of analyze table"""
    global analyze_table
    if analyze_table is None:
        if not DYNAMO_VIDEO_ANALYZE_TABLE:
            raise ValueError("DYNAMO_VIDEO_ANALYZE_TABLE environment variable not set")
        analyze_table = dynamodb.Table(DYNAMO_VIDEO_ANALYZE_TABLE)
    return analyze_table

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
    Process video using Bedrock Converse API
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
        video_response = get_video_table().get_item(Key={'Id': video_id})
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
        model_id = body.get("ModelId") or body.get("model_id") or DEFAULT_BEDROCK_CONVERSE_MODEL_ID
        temperature = body.get("Temperature") or body.get("temperature")
        max_tokens = body.get("MaxTokens") or body.get("max_tokens")
        top_p = body.get("TopP") or body.get("top_p")
        tool_config = body.get("ToolConfig") or body.get("tool_config")  # Optional tool config from frontend
        task_id = body.get("TaskId") or body.get("task_id")  # Task ID for updating DynamoDB
        
        # Get AWS account ID for bucket owner
        sts_client = boto3.client('sts')
        account_id = sts_client.get_caller_identity()["Account"]
        
        # Determine video format from S3 key
        video_format = 'mp4'  # default
        if s3_key.lower().endswith('.mov'):
            video_format = 'mov'
        elif s3_key.lower().endswith('.mkv'):
            video_format = 'mkv'
        elif s3_key.lower().endswith('.webm'):
            video_format = 'webm'
        elif s3_key.lower().endswith('.flv'):
            video_format = 'flv'
        elif s3_key.lower().endswith('.avi'):
            video_format = 'avi'
        elif s3_key.lower().endswith('.mpeg') or s3_key.lower().endswith('.mpg'):
            video_format = 'mpeg'
        elif s3_key.lower().endswith('.wmv'):
            video_format = 'wmv'
        elif s3_key.lower().endswith('.3gp'):
            video_format = 'three_gp'
        
        print(f"Video format detected: {video_format}")
        
        # Build S3 URI
        s3_uri = f's3://{s3_bucket}/{s3_key}'
        print(f"Using S3 video location: {s3_uri}")
        
        # Determine if we should use tool configuration based on model
        # Tool config works for Nova Pro, but not Nova Lite v1 or Nova 2 models
        use_tool_config = 'nova-2' not in model_id.lower() and 'nova-lite-v1' not in model_id.lower()
        
        # Build the prompt
        if use_tool_config:
            # For Nova Pro, use original prompt with tool config
            prompt_text = input_prompt
        else:
            # For Nova Lite v1 and Nova 2 models, enhance prompt with JSON format instructions
            # If tool_config is provided, extract the schema from it
            if tool_config:
                # Extract JSON schema from tool config
                try:
                    tools = tool_config.get('tools', [])
                    if tools and len(tools) > 0:
                        tool_spec = tools[0].get('toolSpec', {})
                        json_schema = tool_spec.get('inputSchema', {}).get('json', {})
                        tool_description = tool_spec.get('description', '')
                        
                        prompt_text = f"""{input_prompt}

{tool_description}

Extract information in JSON format according to the given schema.
Follow these guidelines:
- Ensure that every field is populated.
- Provide timestamps in the format specified in the schema.
- The description field should be a detailed account of what happens in each moment/scene.
- Do not make up events not present in the video.

JSON Schema:
{json.dumps(json_schema, indent=2)}

Return only the JSON object, no additional text."""
                    else:
                        # Fallback if tool config structure is unexpected
                        prompt_text = f"""{input_prompt}

Please provide your response in the following JSON format:
{{
  "scenes": [
    {{
      "start_time": "MM:SS or HH:MM:SS",
      "end_time": "MM:SS or HH:MM:SS",
      "description": "Description of what happens in this scene"
    }}
  ]
}}

Return only the JSON object, no additional text."""
                except Exception as schema_error:
                    print(f"Error extracting schema from tool config: {str(schema_error)}")
                    # Fallback to default format
                    prompt_text = f"""{input_prompt}

Please provide your response in the following JSON format:
{{
  "scenes": [
    {{
      "start_time": "MM:SS or HH:MM:SS",
      "end_time": "MM:SS or HH:MM:SS",
      "description": "Description of what happens in this scene"
    }}
  ]
}}

Return only the JSON object, no additional text."""
            else:
                # No tool config provided, use default format
                prompt_text = f"""{input_prompt}

Please provide your response in the following JSON format:
{{
  "scenes": [
    {{
      "start_time": "MM:SS or HH:MM:SS",
      "end_time": "MM:SS or HH:MM:SS",
      "description": "Description of what happens in this scene"
    }}
  ]
}}

Return only the JSON object, no additional text."""
        
        # Build Converse API message with S3 location
        message = {
            "role": "user",
            "content": [
                {"text": prompt_text},
                {
                    "video": {
                        "format": video_format,
                        "source": {
                            "s3Location": {
                                "uri": s3_uri,
                                "bucketOwner": account_id
                            }
                        }
                    }
                }
            ]
        }
        
        messages = [message]
        
        # Build inference configuration
        inference_config = {}
        if temperature is not None:
            inference_config["temperature"] = float(temperature)
        if max_tokens is not None:
            inference_config["maxTokens"] = int(max_tokens)
        if top_p is not None:
            inference_config["topP"] = float(top_p)
        
        # Build converse parameters
        converse_params = {
            "modelId": model_id,
            "messages": messages
        }
        
        if inference_config:
            converse_params["inferenceConfig"] = inference_config
        
        # Add tool configuration - use provided config or default for Nova Pro only
        if use_tool_config:
            if tool_config:
                # Use tool config provided from frontend
                converse_params["toolConfig"] = tool_config
                print(f"Using custom tool config from request for model: {model_id}")
            else:
                # Use default tool config
                tool_config = {
                    "toolChoice": {
                        "tool": {
                            "name": "video_scene_analysis"
                        }
                    },
                    "tools": [
                        {
                            "toolSpec": {
                                "name": "video_scene_analysis",
                                "description": "Analyze video and return structured scene information with timestamps",
                                "inputSchema": {
                                    "json": {
                                        "type": "object",
                                        "properties": {
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
                                                    "required": [
                                                        "start_time",
                                                        "end_time",
                                                        "description"
                                                    ]
                                                }
                                            }
                                        },
                                        "required": [
                                            "scenes"
                                        ]
                                    }
                                }
                            }
                        }
                    ]
                }
                converse_params["toolConfig"] = tool_config
                print(f"Using default tool config for model: {model_id}")
        else:
            print(f"Using prompt-based JSON for model: {model_id}")
        
        # Call Bedrock Converse API
        print(f"Calling Bedrock Converse API with model: {model_id}")
        print(f"Inference config: {json.dumps(inference_config)}")
        
        # Wrap the API call with retry logic
        def converse_with_retry():
            return bedrock_runtime.converse(**converse_params)
        
        response = retry_with_backoff(converse_with_retry)
        
        print(f"Bedrock response received")
        
        # Extract response details
        output_message = response['output']['message']
        token_usage = response.get('usage', {})
        stop_reason = response.get('stopReason', 'unknown')
        
        # Extract content from response - handle both text and tool use
        response_text = ""
        tool_use_data = None
        
        for content in output_message.get('content', []):
            if 'text' in content:
                response_text += content['text']
            elif 'toolUse' in content:
                # Extract tool use data (structured output from Nova Lite/Pro)
                tool_use = content['toolUse']
                tool_use_data = tool_use.get('input', {})
                print(f"Tool use data: {json.dumps(tool_use_data)}")
        
        # Build result object
        result = {
            "role": output_message.get('role', 'assistant'),
            "stopReason": stop_reason,
            "usage": {
                "inputTokens": token_usage.get('inputTokens', 0),
                "outputTokens": token_usage.get('outputTokens', 0),
                "totalTokens": token_usage.get('totalTokens', 0)
            }
        }
        
        # Add content based on what we received
        if tool_use_data:
            # Structured output via tool use (Nova Lite/Pro)
            result["content"] = json.dumps(tool_use_data)
        else:
            # Plain text response (Nova 2 Lite with JSON in text)
            result["content"] = response_text
        
        print(f"Response: {json.dumps(result)}")
        
        # Update DynamoDB task record if task_id is provided
        analyze_table = get_analyze_table()
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
                    task_item['Result']['Response'] = result.get('content', '')
                    
                    # Add response metadata
                    task_item['Result']['ResponseMetadata'] = {
                        'inputTokens': result['usage'].get('inputTokens', 0),
                        'outputTokens': result['usage'].get('outputTokens', 0),
                        'stopReason': result.get('stopReason', 'unknown')
                    }
                    
                    # Calculate processing time
                    started = datetime.fromisoformat(task_item['StartedTs'].replace('Z', '+00:00'))
                    completed = datetime.fromisoformat(completed_timestamp.replace('Z', '+00:00'))
                    processing_time = (completed - started).total_seconds()
                    task_item['Result']['ProcessingTimeS'] = processing_time
                    
                    # Convert floats to Decimal
                    task_item = convert_floats_to_decimal(task_item)
                    
                    # Save updated task
                    get_analyze_table().put_item(Item=task_item)
                    print(f"Updated task {task_id} in DynamoDB with status: completed")
            except Exception as db_error:
                print(f"Error updating DynamoDB: {str(db_error)}")
                # Don't fail the lambda if DB update fails
        
        # Return response directly without storing to DynamoDB
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'video_id': video_id,
                'status': 'completed',
                'response': result,
                'message': 'Bedrock Converse video analysis completed successfully'
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
                task_response = get_analyze_table().get_item(Key={'Id': task_id, 'Type': 'video-understanding'})
                if 'Item' in task_response:
                    task_item = task_response['Item']
                    task_item['CompletedTs'] = completed_timestamp
                    task_item['Status'] = 'failed'
                    task_item['Result']['ErrorMessage'] = str(e)
                    
                    task_item = convert_floats_to_decimal(task_item)
                    get_analyze_table().put_item(Item=task_item)
                    print(f"Updated task {task_id} in DynamoDB with status: failed")
            except Exception as db_error:
                print(f"Error updating DynamoDB on failure: {str(db_error)}")
        
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)})
        }
