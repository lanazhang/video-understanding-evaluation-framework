import json
import boto3
import os

DYNAMO_VIDEO_TABLE = os.environ.get("DYNAMO_VIDEO_TABLE")
DEFAULT_BEDROCK_CONVERSE_MODEL_ID = os.environ.get("DEFAULT_BEDROCK_CONVERSE_MODEL_ID", "us.amazon.nova-pro-v1:0")

# CORS headers for all responses
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
}

bedrock_runtime = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')

video_table = dynamodb.Table(DYNAMO_VIDEO_TABLE)

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
        model_id = body.get("ModelId") or body.get("model_id") or DEFAULT_BEDROCK_CONVERSE_MODEL_ID
        temperature = body.get("Temperature") or body.get("temperature")
        max_tokens = body.get("MaxTokens") or body.get("max_tokens")
        
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
        # Tool config works for Nova Lite and Nova Pro, but not Nova 2 Lite
        use_tool_config = 'nova-2' not in model_id.lower()
        
        # Build the prompt
        if use_tool_config:
            # For Nova Lite and Nova Pro, use original prompt with tool config
            prompt_text = input_prompt
        else:
            # For Nova 2 Lite, enhance prompt with JSON format instructions
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
        
        # Build converse parameters
        converse_params = {
            "modelId": model_id,
            "messages": messages
        }
        
        if inference_config:
            converse_params["inferenceConfig"] = inference_config
        
        # Add tool configuration for Nova Lite and Nova Pro
        if use_tool_config:
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
            print(f"Using tool config for model: {model_id}")
        else:
            print(f"Using prompt-based JSON for model: {model_id}")
        
        # Call Bedrock Converse API
        print(f"Calling Bedrock Converse API with model: {model_id}")
        print(f"Inference config: {json.dumps(inference_config)}")
        
        response = bedrock_runtime.converse(**converse_params)
        
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
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)})
        }
