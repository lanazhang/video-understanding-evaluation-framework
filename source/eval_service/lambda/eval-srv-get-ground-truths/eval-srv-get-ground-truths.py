import json
import boto3
import os
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')

table_name = os.environ.get('DYNAMO_GROUND_TRUTH_TABLE')
video_table_name = os.environ.get('DYNAMO_VIDEO_TABLE')
analyze_table_name = os.environ.get('DYNAMO_VIDEO_ANALYZE_TABLE')
S3_PRESIGNED_URL_EXPIRY_S = int(os.environ.get('S3_PRESIGNED_URL_EXPIRY_S', 3600))  # Default 1 hour

table = dynamodb.Table(table_name)
video_table = dynamodb.Table(video_table_name)
analyze_table = dynamodb.Table(analyze_table_name)

# CORS headers for all responses
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
}

class DecimalEncoder(json.JSONEncoder):
    """Helper class to convert Decimal to float for JSON serialization"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super(DecimalEncoder, self).default(obj)

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

def get_video_details(video_id):
    """
    Fetch video details from video table and generate presigned URLs
    """
    try:
        response = video_table.get_item(Key={'Id': video_id})
        video = response.get('Item')
        
        if video:
            # Generate presigned URLs for video and thumbnail
            s3_bucket = video.get('S3Bucket')
            s3_key_video = video.get('S3KeyVideo')
            s3_key_thumbnail = video.get('S3KeyThumbnail')
            
            if s3_bucket and s3_key_video:
                video_url = generate_video_presigned_url(s3_bucket, s3_key_video)
                if video_url:
                    video['video_url'] = video_url
            
            if s3_bucket and s3_key_thumbnail:
                thumbnail_url = generate_thumbnail_presigned_url(s3_bucket, s3_key_thumbnail)
                if thumbnail_url:
                    video['thumbnail_url'] = thumbnail_url
        
        return video
    except Exception as e:
        print(f"Error fetching video {video_id}: {str(e)}")
        return None

def get_analyze_tasks(task_ids):
    """
    Fetch analyze task details for a list of task IDs
    """
    tasks = []
    for task_id in task_ids:
        try:
            response = analyze_table.get_item(Key={'Id': task_id})
            task = response.get('Item')
            if task:
                tasks.append(task)
        except Exception as e:
            print(f"Error fetching analyze task {task_id}: {str(e)}")
    
    return tasks

def lambda_handler(event, context):
    """
    Get ground truth records from DynamoDB table
    Supports filtering by VideoId and CreatedBy via POST body
    Enriches each ground truth with video details (including presigned URLs) and analyze task details
    
    Request body parameters:
    - VideoId (optional): Filter by video ID
    - CreatedBy (optional): Filter by creator username
    """
    try:
        print(f"Received event: {json.dumps(event)}")
        
        # Parse POST body
        body = event
        if isinstance(event.get('body'), str):
            try:
                body = json.loads(event.get('body', '{}'))
            except:
                body = {}
        elif 'body' in event and event['body'] is None:
            body = {}
        
        # Get parameters from POST body (support both PascalCase and camelCase)
        video_id = body.get('VideoId') or body.get('videoId')
        created_by = body.get('CreatedBy') or body.get('createdBy')
        
        print(f"Filtering - VideoId: {video_id}, CreatedBy: {created_by}")
        
        if video_id:
            # Query by VideoId using GSI
            print(f"Querying ground truths for VideoId: {video_id}")
            
            if created_by:
                # Query with VideoId and filter by CreatedBy
                print(f"Filtering by CreatedBy: {created_by}")
                response = table.query(
                    IndexName='VideoId-index',
                    KeyConditionExpression='VideoId = :video_id',
                    FilterExpression='CreatedBy = :created_by',
                    ExpressionAttributeValues={
                        ':video_id': video_id,
                        ':created_by': created_by
                    }
                )
            else:
                # Query only by VideoId
                response = table.query(
                    IndexName='VideoId-index',
                    KeyConditionExpression='VideoId = :video_id',
                    ExpressionAttributeValues={
                        ':video_id': video_id
                    }
                )
        else:
            # Scan all ground truths
            print("Scanning all ground truths")
            
            if created_by:
                # Scan with CreatedBy filter
                print(f"Filtering by CreatedBy: {created_by}")
                response = table.scan(
                    FilterExpression='CreatedBy = :created_by',
                    ExpressionAttributeValues={
                        ':created_by': created_by
                    }
                )
            else:
                # Scan without filters
                response = table.scan()
        
        items = response.get('Items', [])
        print(f"Found {len(items)} ground truth records")
        
        # Enrich each ground truth with video and analyze task details
        for item in items:
            # Fetch video details with presigned URLs
            video_id = item.get('VideoId')
            if video_id:
                video = get_video_details(video_id)
                if video:
                    item['video'] = video
            
            # Fetch analyze task details
            task_ids = item.get('VideoAnalyzeTaskIds', [])
            if task_ids:
                tasks = get_analyze_tasks(task_ids)
                if tasks:
                    item['analyzeTasks'] = tasks
        
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'groundTruths': items,
                'count': len(items)
            }, cls=DecimalEncoder)
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
