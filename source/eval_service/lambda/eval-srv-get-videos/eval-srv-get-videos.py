import json
import boto3
import os
from boto3.dynamodb.conditions import Key, Attr
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')
table_name = os.environ.get('DYNAMO_VIDEO_TABLE')
table = dynamodb.Table(table_name)
gt_table_name = os.environ.get('DYNAMO_GROUND_TRUTH_TABLE')
gt_table = dynamodb.Table(gt_table_name) if gt_table_name else None
S3_PRESIGNED_URL_EXPIRY_S = int(os.environ.get('S3_PRESIGNED_URL_EXPIRY_S', 3600))  # Default 1 hour

# CORS headers for all responses
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
}

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

def get_gt_count_for_video(video_id):
    """
    Get the count of ground truths for a specific video
    """
    try:
        if not gt_table:
            return 0
        
        response = gt_table.query(
            IndexName='VideoId-index',
            KeyConditionExpression=Key('VideoId').eq(video_id),
            Select='COUNT'
        )
        return response.get('Count', 0)
    except Exception as e:
        print(f"Error getting GT count for video {video_id}: {str(e)}")
        return 0

def lambda_handler(event, context):
    """
    Get videos from DynamoDB table with pagination support
    Supports filtering by uploaded_by and group
    Pagination using start_index and page_size
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
        
        # Get pagination parameters
        start_index = body.get('start_index', 0)  # Starting index (default 0)
        page_size = body.get('page_size', 20)  # Items per page (default 20)
        
        # Get filter parameters
        uploaded_by = body.get('uploaded_by', '').strip()
        group = body.get('group', '').strip()
        
        # Build scan parameters with filters
        scan_kwargs = {}
        filter_expressions = []
        expression_attribute_values = {}
        
        # Add uploaded_by filter if provided
        if uploaded_by:
            filter_expressions.append('UploadedBy = :uploaded_by')
            expression_attribute_values[':uploaded_by'] = uploaded_by
        
        # Add group filter if provided
        if group:
            filter_expressions.append('#grp = :group')
            scan_kwargs['ExpressionAttributeNames'] = {'#grp': 'group'}
            expression_attribute_values[':group'] = group
        
        # Combine filter expressions
        if filter_expressions:
            scan_kwargs['FilterExpression'] = ' AND '.join(filter_expressions)
            scan_kwargs['ExpressionAttributeValues'] = expression_attribute_values
        
        print(f"Scan parameters: {json.dumps(scan_kwargs, default=str)}")
        
        # Scan the entire table (we'll handle pagination in memory)
        all_items = []
        last_evaluated_key = None
        
        while True:
            if last_evaluated_key:
                scan_kwargs['ExclusiveStartKey'] = last_evaluated_key
            
            response = table.scan(**scan_kwargs)
            all_items.extend(response.get('Items', []))
            
            last_evaluated_key = response.get('LastEvaluatedKey')
            if not last_evaluated_key:
                break
        
        # Sort by UploadedTs in descending order (newest first)
        all_items.sort(key=lambda x: x.get('UploadedTs', ''), reverse=True)
        
        # Calculate pagination
        total_count = len(all_items)
        end_index = start_index + page_size
        paginated_items = all_items[start_index:end_index]
        
        # Generate pre-signed URLs for thumbnails and videos, and get GT counts
        for item in paginated_items:
            s3_bucket = item.get('S3Bucket')
            s3_key_thumbnail = item.get('S3KeyThumbnail')
            s3_key_video = item.get('S3KeyVideo')
            video_id = item.get('Id')
            
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
            
            # Get GT count for this video
            if video_id:
                item['gt_count'] = get_gt_count_for_video(video_id)
        
        # Prepare response
        result = {
            'videos': paginated_items,
            'count': len(paginated_items),
            'total_count': total_count,
            'start_index': start_index,
            'page_size': page_size,
            'has_more': end_index < total_count
        }
        
        print(f"Returning {len(paginated_items)} videos out of {total_count} total")
        
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps(result, cls=DecimalEncoder)
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
