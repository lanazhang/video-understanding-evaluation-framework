import json
import boto3
import os
from datetime import datetime
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('DYNAMO_VIDEO_TABLE')
table = dynamodb.Table(table_name)

def lambda_handler(event, context):
    """
    Add video metadata to DynamoDB table
    """
    try:
        # Log the incoming event for debugging
        print(f"Received event: {json.dumps(event)}")
        
        # Parse body - handle both string and dict
        body_raw = event.get('body', '{}')
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
        required_fields = ['TaskId', 'FileName', 'TaskName']
        missing_fields = [field for field in required_fields if not body.get(field)]
        
        if missing_fields:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': f'Missing required fields: {", ".join(missing_fields)}'
                })
            }
        
        # Prepare item for DynamoDB using the new schema
        timestamp = datetime.utcnow().isoformat() + 'Z'
        item = {
            'id': body['TaskId'],
            'name': body['TaskName'],
            'description': body.get('Description', ''),
            'uploaded_ts': timestamp,
            'uploaded_by': uploaded_by
        }
        
        # Add S3 information if provided
        if body.get('Video') and body['Video'].get('S3Object'):
            s3_object = body['Video']['S3Object']
            item['s3_bucket'] = s3_object.get('Bucket', '')
            item['s3_key_video'] = s3_object.get('Key', '')
            # Generate thumbnail key based on video key
            if s3_object.get('Key'):
                video_key = s3_object['Key']
                # Extract path and filename
                path_parts = video_key.rsplit('/', 1)
                if len(path_parts) == 2:
                    base_path = path_parts[0]
                    filename = path_parts[1]
                    # Remove extension and add thumbnail path
                    name_without_ext = filename.rsplit('.', 1)[0]
                    item['s3_key_thumbnail'] = f"{base_path}/thumbnails/{name_without_ext}.jpg"
        
        # Add optional fields if provided
        if body.get('Duration'):
            item['duration'] = body['Duration']
        
        if body.get('Resolution'):
            item['resolution'] = body['Resolution']
        
        # Add any additional metadata
        if body.get('Metadata'):
            for key, value in body['Metadata'].items():
                if key not in item:  # Don't override existing fields
                    item[key] = value
        
        print(f"Storing item to DynamoDB: {json.dumps(item)}")
        
        # Store to DynamoDB
        table.put_item(Item=item)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Video metadata stored successfully',
                'id': body['TaskId'],
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
