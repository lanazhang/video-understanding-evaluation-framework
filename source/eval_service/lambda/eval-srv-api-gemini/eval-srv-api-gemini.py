import json
import boto3
import os
import time
from datetime import datetime, timezone
from decimal import Decimal

# Try to import the new google.genai client, fall back to old one if not available
try:
    from google import genai
    USE_NEW_CLIENT = True
except ImportError:
    import google.generativeai as genai
    USE_NEW_CLIENT = False

DYNAMO_VIDEO_TABLE = os.environ.get("DYNAMO_VIDEO_TABLE")
DYNAMO_VIDEO_ANALYZE_TABLE = os.environ.get("DYNAMO_VIDEO_ANALYZE_TABLE")
DEFAULT_GEMINI_MODEL_ID = os.environ.get("DEFAULT_GEMINI_MODEL_ID", "gemini-1.5-flash")

# Retry configuration
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds

# CORS headers for all responses
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
}

dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')
secrets_manager = boto3.client('secretsmanager')

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

def get_api_key_from_secrets(username):
    """Retrieve Gemini API key from AWS Secrets Manager"""
    secret_name = f"gemini-api-key/{username}"
    try:
        response = secrets_manager.get_secret_value(SecretId=secret_name)
        secret_data = json.loads(response['SecretString'])
        return secret_data.get('apiKey')
    except secrets_manager.exceptions.ResourceNotFoundException:
        return None
    except Exception as e:
        print(f"Error retrieving API key from Secrets Manager: {str(e)}")
        return None

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
    Process video using Google Gemini API
    """
    try:
        print(f"Received event: {json.dumps(event)}")
        
        # Parse body - handle both API Gateway and direct invocation
        body = None
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
        
        # Get username from Cognito authorizer or from request body
        username = None
        if 'requestContext' in event and 'authorizer' in event['requestContext']:
            username = event['requestContext']['authorizer']['claims'].get('cognito:username')
        
        # If not in request context, check if it's in the body (from start-video-understanding Lambda)
        if not username and body:
            username = body.get("Username") or body.get("username")
        
        # Validate required fields - accept both snake_case (API) and PascalCase (internal)
        video_id = body.get("VideoId") or body.get("video_id")
        input_prompt = body.get("InputPrompt") or body.get("inputPrompt") or body.get("input_prompt")
        
        # API key can be provided in request or retrieved from Secrets Manager
        api_key = body.get("ApiKey") or body.get("api_key")
        
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
        
        # If API key not provided in request, try to get it from Secrets Manager
        if not api_key and username:
            api_key = get_api_key_from_secrets(username)
            if api_key:
                print(f"Retrieved API key from Secrets Manager for user: {username}")
        
        if not api_key:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({
                    'error': 'Gemini API key not found. Please configure your API key in Settings or provide it in the request.'
                })
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
        model_id = body.get("ModelId") or body.get("model_id") or DEFAULT_GEMINI_MODEL_ID
        temperature = body.get("Temperature") or body.get("temperature")
        max_tokens = body.get("MaxTokens") or body.get("max_tokens")
        top_p = body.get("TopP") or body.get("top_p")
        response_schema = body.get("ResponseSchema") or body.get("response_schema")  # Structured output schema
        task_id = body.get("TaskId") or body.get("task_id")  # Task ID for updating DynamoDB
        
        # Download video from S3 to /tmp
        local_video_path = f'/tmp/{os.path.basename(s3_key)}'
        print(f"Downloading video from s3://{s3_bucket}/{s3_key} to {local_video_path}")
        s3_client.download_file(s3_bucket, s3_key, local_video_path)
        
        # Process with new or old client
        if USE_NEW_CLIENT:
            print("Using new google.genai client")
            # Initialize new client
            client = genai.Client(api_key=api_key)
            
            # Upload video file
            print(f"Uploading video to Gemini File API")
            upload_result = client.files.upload(path=local_video_path)
            print(f"Upload result type: {type(upload_result)}, value: {upload_result}")
            
            # Handle different return types from upload
            if isinstance(upload_result, str):
                print(f"Upload returned string, fetching file object: {upload_result}")
                video_file = client.files.get(name=upload_result)
                print(f"File object retrieved, type: {type(video_file)}")
            else:
                video_file = upload_result
            
            # Verify we have a proper file object
            if isinstance(video_file, str):
                print(f"ERROR: Still have string after get: {video_file}")
                # Last resort: create a simple object to work with
                return {
                    'statusCode': 500,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({
                        'error': 'Unable to get proper file object from Gemini API',
                        'file_reference': video_file
                    })
                }
            
            print(f"Video file ready: {video_file.name if hasattr(video_file, 'name') else 'unknown'}")
            
            # Wait for video processing (max 5 minutes)
            max_wait_time = 300
            wait_interval = 5
            elapsed_time = 0
            
            # Check if video_file has state attribute
            if not hasattr(video_file, 'state'):
                print(f"Error: video_file object doesn't have 'state' attribute. Type: {type(video_file)}")
                print(f"video_file attributes: {dir(video_file)}")
                return {
                    'statusCode': 500,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({
                        'error': f'Invalid video file object. Type: {type(video_file).__name__}',
                        'attributes': str(dir(video_file))
                    })
                }
            
            # Get state value - it might be a string or an object with .name
            def get_state_value(state):
                if isinstance(state, str):
                    return state
                elif hasattr(state, 'name'):
                    return state.name
                else:
                    return str(state)
            
            current_state = get_state_value(video_file.state)
            print(f"Initial video state: {current_state}")
            
            while current_state == "PROCESSING":
                if elapsed_time >= max_wait_time:
                    return {
                        'statusCode': 408,
                        'headers': CORS_HEADERS,
                        'body': json.dumps({'error': 'Video processing timeout'})
                    }
                
                print(f"Processing video... ({elapsed_time}s elapsed)")
                time.sleep(wait_interval)
                elapsed_time += wait_interval
                video_file = client.files.get(name=video_file.name)
                current_state = get_state_value(video_file.state)
            
            if current_state == "FAILED":
                return {
                    'statusCode': 500,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'error': f'Video processing failed: {current_state}'})
                }
            
            print(f"Video processing completed: {current_state}")
            
            # Build generation config
            config = {}
            if temperature is not None:
                config["temperature"] = float(temperature)
            if max_tokens is not None:
                config["max_output_tokens"] = int(max_tokens)
            if top_p is not None:
                config["top_p"] = float(top_p)
            
            # Add structured output configuration if schema provided
            if response_schema:
                config["response_mime_type"] = "application/json"
                # Use jsonSchema key for structured output
                config["response_schema"] = {"type": "object", "properties": response_schema} if isinstance(response_schema, dict) and "type" not in response_schema else response_schema
                print(f"Using structured output with schema: {json.dumps(config['response_schema'])}")
            else:
                # Even without schema, request JSON output
                config["response_mime_type"] = "application/json"
                print("Requesting JSON output without strict schema")
            
            # Generate content
            print(f"Generating content with model: {model_id}")
            print(f"Config: {json.dumps(config)}")
            print(f"Video file object type: {type(video_file)}")
            print(f"Video file name: {video_file.name if hasattr(video_file, 'name') else 'N/A'}")
            
            # Enhance the prompt to explicitly mention video analysis and JSON format
            if response_schema:
                # With schema, just mention video analysis
                enhanced_prompt = f"Analyze the provided video and {input_prompt}"
            else:
                # Without schema, add JSON format instruction to the prompt
                enhanced_prompt = f"""Analyze the provided video and {input_prompt}

Please provide your response in JSON format with the following structure:
{{
  "summary": "A high-level summary of the entire video content",
  "scenes": [
    {{
      "start_time": "MM:SS or HH:MM:SS",
      "end_time": "MM:SS or HH:MM:SS",
      "description": "Description of what happens in this scene"
    }}
  ]
}}"""
            print(f"Enhanced prompt: {enhanced_prompt}")
            
            # Wrap the API call with retry logic
            def generate_content_with_retry():
                # Ensure we're passing the video file object correctly
                # The contents should be a list with the file object and the prompt
                return client.models.generate_content(
                    model=model_id,
                    contents=[video_file, enhanced_prompt],
                    config=config if config else None
                )
            
            response = retry_with_backoff(generate_content_with_retry)
            
            print(f"Gemini response received")
            
            # Extract response - use parsed for structured output, text otherwise
            if response_schema and hasattr(response, 'parsed'):
                # Structured output - convert to JSON string
                response_text = json.dumps(response.parsed)
                print(f"Structured response: {response_text}")
            else:
                # Plain text response
                response_text = response.text if hasattr(response, 'text') else str(response)
            
            # Build result object
            result = {
                "role": "assistant",
                "content": response_text,
                "stopReason": "complete"
            }
            
            # Add usage info if available
            if hasattr(response, 'usage_metadata'):
                result["usage"] = {
                    "inputTokens": getattr(response.usage_metadata, 'prompt_token_count', 0),
                    "outputTokens": getattr(response.usage_metadata, 'candidates_token_count', 0),
                    "totalTokens": getattr(response.usage_metadata, 'total_token_count', 0)
                }
            
            # Clean up: delete uploaded file from Gemini
            try:
                file_name = video_file.name if hasattr(video_file, 'name') else str(video_file)
                client.files.delete(name=file_name)
                print(f"Deleted video file from Gemini: {file_name}")
            except Exception as e:
                print(f"Warning: Failed to delete video file: {str(e)}")
        
        else:
            print("Using old google.generativeai client")
            # Initialize old client
            genai.configure(api_key=api_key)
            
            # Upload video to Gemini File API
            print(f"Uploading video to Gemini File API")
            video_file = genai.upload_file(path=local_video_path)
            print(f"Video uploaded: {video_file.name}")
            
            # Wait for video processing (max 5 minutes)
            max_wait_time = 300
            wait_interval = 5
            elapsed_time = 0
            
            while video_file.state.name == "PROCESSING":
                if elapsed_time >= max_wait_time:
                    return {
                        'statusCode': 408,
                        'headers': CORS_HEADERS,
                        'body': json.dumps({'error': 'Video processing timeout'})
                    }
                
                print(f"Processing video... ({elapsed_time}s elapsed)")
                time.sleep(wait_interval)
                elapsed_time += wait_interval
                video_file = genai.get_file(name=video_file.name)
            
            if video_file.state.name == "FAILED":
                return {
                    'statusCode': 500,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'error': f'Video processing failed: {video_file.state.name}'})
                }
            
            print(f"Video processing completed: {video_file.state.name}")
            
            # Enhance prompt to request structured JSON output if no schema provided
            if not response_schema:
                enhanced_prompt = f"""{input_prompt}

Please provide your response in the following JSON format:
{{
  "summary": "A high-level summary of the entire video content",
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
                enhanced_prompt = input_prompt
            
            # Build generation config
            generation_config = {}
            if temperature is not None:
                generation_config["temperature"] = float(temperature)
            if max_tokens is not None:
                generation_config["max_output_tokens"] = int(max_tokens)
            if top_p is not None:
                generation_config["top_p"] = float(top_p)
            
            # Generate content based on the video
            print(f"Generating content with model: {model_id}")
            print(f"Generation config: {json.dumps(generation_config)}")
            
            model = genai.GenerativeModel(model_name=model_id)
            
            # Wrap the API call with retry logic
            def generate_content_with_retry():
                return model.generate_content(
                    [video_file, enhanced_prompt],
                    generation_config=generation_config if generation_config else None
                )
            
            response = retry_with_backoff(generate_content_with_retry)
            
            print(f"Gemini response received")
            
            # Extract response text
            response_text = response.text if hasattr(response, 'text') else str(response)
            
            # Build result object
            result = {
                "role": "assistant",
                "content": response_text,
                "stopReason": "complete"
            }
            
            # Add usage info if available
            if hasattr(response, 'usage_metadata'):
                result["usage"] = {
                    "inputTokens": getattr(response.usage_metadata, 'prompt_token_count', 0),
                    "outputTokens": getattr(response.usage_metadata, 'candidates_token_count', 0),
                    "totalTokens": getattr(response.usage_metadata, 'total_token_count', 0)
                }
            
            # Clean up: delete uploaded file from Gemini
            try:
                genai.delete_file(name=video_file.name)
                print(f"Deleted video file from Gemini: {video_file.name}")
            except Exception as e:
                print(f"Warning: Failed to delete video file: {str(e)}")
        
        # Clean up: delete local file
        try:
            os.remove(local_video_path)
            print(f"Deleted local video file: {local_video_path}")
        except Exception as e:
            print(f"Warning: Failed to delete local file: {str(e)}")
        
        print(f"Response: {json.dumps(result)}")
        
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
                    task_item['Result']['Response'] = result.get('content', '')
                    
                    # Add response metadata if available
                    if 'usage' in result:
                        task_item['Result']['ResponseMetadata'] = {
                            'inputTokens': result['usage'].get('inputTokens', 0),
                            'outputTokens': result['usage'].get('outputTokens', 0),
                            'stopReason': result.get('stopReason', 'unknown')
                        }
                    else:
                        task_item['Result']['ResponseMetadata'] = {
                            'stopReason': result.get('stopReason', 'unknown')
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
        
        # Return response directly without storing to DynamoDB
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'video_id': video_id,
                'status': 'completed',
                'response': result,
                'message': 'Gemini video analysis completed successfully'
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
