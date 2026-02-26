import json
import boto3
import os
import time
import google.generativeai as genai

DYNAMO_VIDEO_TABLE = os.environ.get("DYNAMO_VIDEO_TABLE")
DEFAULT_GEMINI_MODEL_ID = os.environ.get("DEFAULT_GEMINI_MODEL_ID", "gemini-1.5-flash")

# CORS headers for all responses
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
}

dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

video_table = dynamodb.Table(DYNAMO_VIDEO_TABLE)

def lambda_handler(event, context):
    """
    Process video using Google Gemini API
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
        
        if not api_key:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Missing required field: ApiKey or api_key'})
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
        
        # Download video from S3 to /tmp
        local_video_path = f'/tmp/{os.path.basename(s3_key)}'
        print(f"Downloading video from s3://{s3_bucket}/{s3_key} to {local_video_path}")
        s3_client.download_file(s3_bucket, s3_key, local_video_path)
        
        # Initialize Gemini client with API key from payload
        genai.configure(api_key=api_key)
        
        # Upload video to Gemini File API
        print(f"Uploading video to Gemini File API")
        video_file = genai.upload_file(path=local_video_path)
        print(f"Video uploaded: {video_file.name}")
        
        # Wait for video processing (max 5 minutes)
        max_wait_time = 300  # 5 minutes
        wait_interval = 5  # 5 seconds
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
        
        # Enhance prompt to request structured JSON output
        enhanced_prompt = f"""{input_prompt}

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
        
        # Build generation config
        generation_config = {}
        if temperature is not None:
            generation_config["temperature"] = float(temperature)
        if max_tokens is not None:
            generation_config["max_output_tokens"] = int(max_tokens)
        
        # Generate content based on the video
        print(f"Generating content with model: {model_id}")
        print(f"Generation config: {json.dumps(generation_config)}")
        
        model = genai.GenerativeModel(model_name=model_id)
        response = model.generate_content(
            [video_file, enhanced_prompt],
            generation_config=generation_config if generation_config else None
        )
        
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
        
        print(f"Response: {json.dumps(result)}")
        
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
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)})
        }
