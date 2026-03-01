import json
import boto3
import uuid
import os
from datetime import datetime, timezone
from decimal import Decimal

DYNAMO_VIDEO_ANALYZE_TABLE = os.environ.get("DYNAMO_VIDEO_ANALYZE_TABLE")
DYNAMO_VIDEO_TABLE = os.environ.get("DYNAMO_VIDEO_TABLE")

# Lambda function names from environment
LAMBDA_BEDROCK_CONVERSE = os.environ.get("LAMBDA_BEDROCK_CONVERSE")
LAMBDA_TLABS_PEGASUS = os.environ.get("LAMBDA_TLABS_PEGASUS")
LAMBDA_GEMINI = os.environ.get("LAMBDA_GEMINI")

# CORS headers for all responses
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
}

dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')
secrets_manager = boto3.client('secretsmanager')

analyze_table = dynamodb.Table(DYNAMO_VIDEO_ANALYZE_TABLE)
video_table = dynamodb.Table(DYNAMO_VIDEO_TABLE)

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
    Start video understanding analysis task
    Creates DynamoDB record, invokes appropriate API lambda, and updates record with response
    """
    try:
        print(f"Received event: {json.dumps(event)}")
        
        # Parse body - handle both API Gateway and direct invocation
        if 'body' in event:
            body = event['body']
            if isinstance(body, str):
                body = json.loads(body)
        else:
            body = event
            if isinstance(body, str):
                body = json.loads(body)
        
        print(f"Parsed body: {json.dumps(body)}")
        
        # Validate required fields
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
        
        # Extract request parameters
        request_params = body.get("Request", {})
        api_type = request_params.get("ApiType") or body.get("api_type")
        
        if not api_type:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Missing required field: ApiType'})
            }
        
        # Validate ApiType
        valid_api_types = ['bedrock_converse', 'tlabs_pegasus', 'gemini']
        if api_type not in valid_api_types:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({
                    'error': f'Invalid ApiType. Must be one of: {", ".join(valid_api_types)}'
                })
            }
        
        # Get other parameters
        model_id = body.get("ModelId") or body.get("model_id")
        if not model_id:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Missing required field: ModelId'})
            }
        
        prompt = request_params.get("Prompt") or body.get("prompt") or body.get("InputPrompt") or body.get("input_prompt")
        if not prompt:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Missing required field: Prompt'})
            }
        
        description = body.get("Description") or body.get("description") or ""
        inference_config = request_params.get("InferenceConfig") or body.get("inference_config") or {}
        tool_config = request_params.get("ToolConfig") or body.get("tool_config")
        response_schema = request_params.get("ResponseSchema") or body.get("response_schema")  # For Gemini
        response_format = request_params.get("ResponseFormat") or body.get("response_format")  # For TwelveLabs
        requested_by = request_params.get("RequestedBy") or body.get("requested_by") or "unknown"
        
        # Get username from request context (Cognito) for passing to Gemini Lambda
        username = event.get('requestContext', {}).get('authorizer', {}).get('claims', {}).get('cognito:username')
        
        # Generate task ID
        task_id = str(uuid.uuid4())
        
        # Define S3 output prefix
        s3_prefix_output = f'tasks/{video_id}/video-analyze/video-understanding/{task_id}/'
        
        # Store analysis record to DynamoDB
        timestamp = datetime.now(timezone.utc).isoformat()
        analyze_item = {
            "Id": task_id,
            "Type": "video-understanding",
            "VideoId": video_id,
            "Description": description,
            "ModelId": model_id,
            "StartedTs": timestamp,
            "Status": "processing",
            "Request": {
                "ApiType": api_type,
                "Prompt": prompt,
                "InferenceConfig": inference_config,
                "RequestedBy": requested_by
            },
            "Result": {
                "S3BucketResult": s3_bucket,
                "S3OutputPrefix": s3_prefix_output
            }
        }
        
        # Add ToolConfig if provided (for bedrock_converse)
        if tool_config:
            analyze_item["Request"]["ToolConfig"] = tool_config
        
        # Convert floats to Decimal for DynamoDB
        analyze_item = convert_floats_to_decimal(analyze_item)
        
        print(f"Storing analysis record: {json.dumps(analyze_item, default=str)}")
        analyze_table.put_item(Item=analyze_item)
        
        # Prepare payload for the specific API lambda
        api_payload = {
            "VideoId": video_id,
            "video_id": video_id,
            "InputPrompt": prompt,
            "input_prompt": prompt,
            "ModelId": model_id,
            "model_id": model_id
        }
        
        # Add inference config parameters
        if inference_config.get("temperature") is not None:
            api_payload["Temperature"] = inference_config["temperature"]
            api_payload["temperature"] = inference_config["temperature"]
        if inference_config.get("maxTokens") is not None:
            api_payload["MaxTokens"] = inference_config["maxTokens"]
            api_payload["max_tokens"] = inference_config["maxTokens"]
        if inference_config.get("topP") is not None:
            api_payload["TopP"] = inference_config["topP"]
            api_payload["top_p"] = inference_config["topP"]
        
        # Add tool_config for bedrock_converse
        if api_type == "bedrock_converse" and tool_config:
            api_payload["ToolConfig"] = tool_config
            api_payload["tool_config"] = tool_config
        
        # Add response format and tool_config for TwelveLabs Pegasus
        if api_type == "tlabs_pegasus":
            if response_format:
                api_payload["ResponseFormat"] = response_format
                api_payload["response_format"] = response_format
            if tool_config:
                api_payload["ToolConfig"] = tool_config
                api_payload["tool_config"] = tool_config
        
        # Add API key and response schema for Gemini
        if api_type == "gemini":
            # Don't pass the API key - let the Gemini Lambda retrieve it from Secrets Manager
            # Instead, pass the username so it can retrieve the key
            if username:
                api_payload["Username"] = username
                api_payload["username"] = username
            
            # Add response schema for Gemini
            if response_schema:
                api_payload["ResponseSchema"] = response_schema
                api_payload["response_schema"] = response_schema
        
        # Determine which lambda to invoke
        lambda_function_name = None
        if api_type == "bedrock_converse":
            lambda_function_name = LAMBDA_BEDROCK_CONVERSE
        elif api_type == "tlabs_pegasus":
            lambda_function_name = LAMBDA_TLABS_PEGASUS
        elif api_type == "gemini":
            lambda_function_name = LAMBDA_GEMINI
        
        if not lambda_function_name:
            return {
                'statusCode': 500,
                'headers': CORS_HEADERS,
                'body': json.dumps({
                    'error': f'Lambda function not configured for ApiType: {api_type}'
                })
            }
        
        # Add task_id to payload so API lambda can update the task record
        api_payload["TaskId"] = task_id
        api_payload["task_id"] = task_id
        
        # Invoke the specific API lambda asynchronously (Event invocation type)
        print(f"Invoking lambda asynchronously: {lambda_function_name} with payload: {json.dumps(api_payload)}")
        
        try:
            lambda_response = lambda_client.invoke(
                FunctionName=lambda_function_name,
                InvocationType='Event',  # Asynchronous invocation - don't wait for response
                Payload=json.dumps(api_payload)
            )
            
            print(f"Lambda invoked asynchronously. StatusCode: {lambda_response['StatusCode']}")
            
            # Return immediate acknowledgment to the client
            return {
                'statusCode': 202,  # 202 Accepted - request accepted for processing
                'headers': CORS_HEADERS,
                'body': json.dumps({
                    'task_id': task_id,
                    'video_id': video_id,
                    'api_type': api_type,
                    'status': 'processing',
                    'message': f'Video understanding task created and processing with {api_type}'
                })
            }
            
        except Exception as invoke_error:
            # Lambda invocation failed
            print(f"Lambda invocation error: {str(invoke_error)}")
            
            # Update task status to failed
            task_response = analyze_table.get_item(Key={'Id': task_id, 'Type': 'video-understanding'})
            if 'Item' in task_response:
                task_item = task_response['Item']
                task_item['CompletedTs'] = datetime.now(timezone.utc).isoformat()
                task_item['Status'] = 'failed'
                task_item['Result']['ErrorMessage'] = str(invoke_error)
                
                task_item = convert_floats_to_decimal(task_item)
                analyze_table.put_item(Item=task_item)
            
            raise invoke_error
    
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)})
        }
