import json
import boto3
import os
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')
table_name = os.environ.get('DYNAMO_VIDEO_TABLE')
metadata_lambda_name = os.environ.get('METADATA_LAMBDA_NAME')
table = dynamodb.Table(table_name)

def lambda_handler(event, context):
    """
    Add video metadata to DynamoDB table and invoke metadata extraction asynchronously
    """
    try:
        # Log the incoming event for debugging
        print(f"Received event: {json.dumps(event)}")
        
        # Parse body - handle both string and dict
        body_raw = event
        if isinstance(body_raw, str):
            body = json.loads(body_raw)
        else:
            body = body_raw
            
        print(f"Parsed body: {json.dumps(body)}")
        
        # Get user info from request context
        request_context = event.get('requestContext', {})
        authorizer = request_context.get('authorizer', {})
        claims = authorizer.get('claims', {})
        uploaded_by = claims.get('email', claims.get('cognito:username', 'unknown'))
        
        # Validate required fields
        required_fields = ['id', 'name', 's3_bucket', 's3_key_video']
        missing_fields = [field for field in required_fields if not body.get(field)]
        
        if missing_fields:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': f'Missing required fields: {", ".join(missing_fields)}'
                })
            }
        
        # Prepare item for DynamoDB using the schema
        timestamp = datetime.utcnow().isoformat() + 'Z'
        item = {
            'Id': body['id'],  # DynamoDB table uses 'Id' with capital I
            'name': body['name'],
            'description': body.get('description', ''),
            's3_bucket': body['s3_bucket'],
            's3_key_video': body['s3_key_video'],
            'uploaded_ts': timestamp,
            'uploaded_by': uploaded_by
        }
        
        # Generate thumbnail key based on video key
        video_key = body['s3_key_video']
        path_parts = video_key.rsplit('/', 1)
        if len(path_parts) == 2:
            base_path = path_parts[0]
            filename = path_parts[1]
            # Remove extension and add thumbnail path
            name_without_ext = filename.rsplit('.', 1)[0]
            item['s3_key_thumbnail'] = f"{base_path}/thumbnails/{name_without_ext}.jpg"
        
        print(f"Storing item to DynamoDB: {json.dumps(item, default=str)}")
        
        # Store to DynamoDB
        table.put_item(Item=item)
        
        # Invoke metadata extraction Lambda asynchronously
        if metadata_lambda_name:
            payload = {
                'id': body['id'],
                's3_bucket': body['s3_bucket'],
                's3_key_video': body['s3_key_video']
            }
            print(f"Invoking metadata Lambda: {metadata_lambda_name}")
            lambda_client.invoke(
                FunctionName=metadata_lambda_name,
                InvocationType='Event',  # Async invocation
                Payload=json.dumps(payload)
            )
            print(f"Metadata extraction Lambda invoked asynchronously")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Video metadata stored successfully',
                'id': body['id'],
                'uploaded_ts': timestamp
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
