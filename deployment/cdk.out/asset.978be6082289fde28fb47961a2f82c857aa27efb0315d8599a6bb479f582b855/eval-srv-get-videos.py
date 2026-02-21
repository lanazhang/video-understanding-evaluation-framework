import json
import boto3
import os
from boto3.dynamodb.conditions import Key, Attr
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')
table_name = os.environ.get('DYNAMO_VIDEO_TABLE')
table = dynamodb.Table(table_name)
S3_PRESIGNED_URL_EXPIRY_S = int(os.environ.get('S3_PRESIGNED_URL_EXPIRY_S', 3600))  # Default 1 hour

class DecimalEncoder(json.JSONEncoder):
    """Helper class to convert DynamoDB Decimal types to JSON"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super(DecimalEncoder, self).default(obj)

def generate_thumbnail_presigned_url(s3_bucket, s3_key):
    """
    Generate pre-signed URL for thumbnail image
    """
    try:
        if not s3_bucket or not s3_key:
            return None
        
        url = s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': s3_bucket, 'Key': s3_key},
            ExpiresIn=S3_PRESIGNED_URL_EXPIRY_S
        )
        return url
    except Exception as e:
        print(f"Error generating pre-signed URL for {s3_bucket}/{s3_key}: {str(e)}")
        return None

def generate_video_presigned_url(s3_bucket, s3_key):
    """
    Generate pre-signed URL for video file
    """
    try:
        if not s3_bucket or not s3_key:
            return None
        
        url = s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': s3_bucket, 'Key': s3_key},
            ExpiresIn=S3_PRESIGNED_URL_EXPIRY_S
        )
        return url
    except Exception as e:
        print(f"Error generating pre-signed URL for {s3_bucket}/{s3_key}: {str(e)}")
        return None

def lambda_handler(event, context):
    """
    Get videos from DynamoDB table with pagination support
    Sorted by uploaded_ts in descending order
    Optional filter by uploaded_by
    """
    try:
        # Log the incoming event for debugging
        print(f"Received event: {json.dumps(event)}")
        
        # Parse body - handle both string and dict
        body_raw = event.get('body', '{}')
        if isinstance(body_raw, str):
            body = json.loads(body_raw) if body_raw else {}
        else:
            body = body_raw or {}
            
        print(f"Parsed body: {json.dumps(body)}")
        
        # Get pagination parameters
        limit = body.get('limit', 20)  # Default 20 items per page
        last_evaluated_key = body.get('last_evaluated_key')  # For pagination
        
        # Get filter parameter
        uploaded_by = body.get('uploaded_by', '').strip()
        
        # Build scan parameters
        scan_kwargs = {
            'Limit': limit
        }
        
        # Add filter if uploaded_by is provided
        if uploaded_by:
            scan_kwargs['FilterExpression'] = Attr('uploaded_by').eq(uploaded_by)
        
        # Add pagination token if provided
        if last_evaluated_key:
            scan_kwargs['ExclusiveStartKey'] = last_evaluated_key
        
        print(f"Scan parameters: {json.dumps(scan_kwargs, default=str)}")
        
        # Scan the table
        response = table.scan(**scan_kwargs)
        
        items = response.get('Items', [])
        
        # Generate pre-signed URLs for thumbnails and videos
        for item in items:
            s3_bucket = item.get('s3_bucket')
            s3_key_thumbnail = item.get('s3_key_thumbnail')
            s3_key_video = item.get('s3_key_video')
            
            # Generate thumbnail pre-signed URL
            if s3_bucket and s3_key_thumbnail:
                thumbnail_url = generate_thumbnail_presigned_url(s3_bucket, s3_key_thumbnail)
                if thumbnail_url:
                    item['thumbnail_url'] = thumbnail_url
            
            # Generate video pre-signed URL
            if s3_bucket and s3_key_video:
                video_url = generate_video_presigned_url(s3_bucket, s3_key_video)
                if video_url:
                    item['video_url'] = video_url
        
        # Sort by uploaded_ts in descending order (newest first)
        items.sort(key=lambda x: x.get('uploaded_ts', ''), reverse=True)
        
        # Prepare response
        result = {
            'videos': items,
            'count': len(items)
        }
        
        # Add pagination token if there are more items
        if 'LastEvaluatedKey' in response:
            result['last_evaluated_key'] = response['LastEvaluatedKey']
            result['has_more'] = True
        else:
            result['has_more'] = False
        
        print(f"Returning {len(items)} videos")
        
        return {
            'statusCode': 200,
            'body': json.dumps(result, cls=DecimalEncoder)
        }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
