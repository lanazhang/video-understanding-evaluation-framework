import json
import boto3
import os

DYNAMO_VIDEO_TABLE = os.environ.get("DYNAMO_VIDEO_TABLE")
DEFAULT_TLABS_PEGASUS_MODEL_ID = os.environ.get("DEFAULT_TLABS_PEGASUS_MODEL_ID", "twelvelabs.pegasus-1-0-v1:0")

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

def lambda_handler(event, context):
    """
    Start TwelveLabs Pegasus video understanding analysis task
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
        
        # Get AWS account ID
        account_id = sts.get_caller_identity()["Account"]
        
        # Build TwelveLabs Pegasus request with structured output
        pegasus_request = {
            "inputPrompt": input_prompt,
            "mediaSource": {
                "s3Location": {
                    "uri": f's3://{s3_bucket}/{s3_key}',
                    "bucketOwner": account_id
                }
            },
            "temperature": temperature,
            "responseFormat": {
                "jsonSchema": {
                    "name": "video_analysis",
                    "schema": {
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
                                    "required": ["start_time", "end_time", "description"]
                                }
                            }
                        },
                        "required": ["scenes"]
                    }
                }
            }
        }
        
        # Invoke Bedrock model synchronously
        print(f"Starting TwelveLabs Pegasus task with model: {model_id}")
        print(f"Request: {json.dumps(pegasus_request)}")
        
        bedrock_response = bedrock.invoke_model(
            modelId=model_id,
            body=json.dumps(pegasus_request)
        )
        
        # Parse response
        response_body = json.loads(bedrock_response['body'].read())
        print(f"Bedrock response: {json.dumps(response_body)}")
        
        # Return response directly without storing to DynamoDB
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
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)})
        }
