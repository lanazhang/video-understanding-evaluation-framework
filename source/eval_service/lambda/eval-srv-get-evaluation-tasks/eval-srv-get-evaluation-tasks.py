import json
import boto3
import os
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')

table_name = os.environ.get('DYNAMO_EVALUATION_TASK_TABLE')
ground_truth_table_name = os.environ.get('DYNAMO_GROUND_TRUTH_TABLE')
video_table_name = os.environ.get('DYNAMO_VIDEO_TABLE')
analyze_table_name = os.environ.get('DYNAMO_VIDEO_ANALYZE_TABLE')
S3_PRESIGNED_URL_EXPIRY_S = int(os.environ.get('S3_PRESIGNED_URL_EXPIRY_S', 3600))  # Default 1 hour

table = dynamodb.Table(table_name)
ground_truth_table = dynamodb.Table(ground_truth_table_name)
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

def generate_presigned_url(s3_bucket, s3_key):
    """Generate pre-signed URL for S3 object"""
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

def get_ground_truth_details(ground_truth_id):
    """Fetch ground truth details"""
    try:
        response = ground_truth_table.get_item(Key={'Id': ground_truth_id})
        return response.get('Item')
    except Exception as e:
        print(f"Error fetching ground truth {ground_truth_id}: {str(e)}")
        return None

def get_video_details(video_id):
    """Fetch video details and generate presigned URLs"""
    try:
        response = video_table.get_item(Key={'Id': video_id})
        video = response.get('Item')
        
        if video:
            # Generate presigned URLs for video and thumbnail
            s3_bucket = video.get('S3Bucket')
            s3_key_video = video.get('S3KeyVideo')
            s3_key_thumbnail = video.get('S3KeyThumbnail')
            
            if s3_bucket and s3_key_video:
                video_url = generate_presigned_url(s3_bucket, s3_key_video)
                if video_url:
                    video['video_url'] = video_url
            
            if s3_bucket and s3_key_thumbnail:
                thumbnail_url = generate_presigned_url(s3_bucket, s3_key_thumbnail)
                if thumbnail_url:
                    video['thumbnail_url'] = thumbnail_url
        
        return video
    except Exception as e:
        print(f"Error fetching video {video_id}: {str(e)}")
        return None

def get_analyze_task_details(task_id):
    """Fetch analyze task details"""
    try:
        response = analyze_table.get_item(Key={'Id': task_id})
        return response.get('Item')
    except Exception as e:
        print(f"Error fetching analyze task {task_id}: {str(e)}")
        return None

def lambda_handler(event, context):
    """
    Get evaluation task records from DynamoDB table
    Supports filtering by VideoId, GroundTruthId, and CreatedBy via POST body
    Enriches each evaluation task with ground truth, video, and analyze task details
    
    Request body parameters:
    - VideoId (optional): Filter by video ID
    - GroundTruthId (optional): Filter by ground truth ID
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
        ground_truth_id = body.get('GroundTruthId') or body.get('groundTruthId')
        created_by = body.get('CreatedBy') or body.get('createdBy')
        
        print(f"Filtering - VideoId: {video_id}, GroundTruthId: {ground_truth_id}, CreatedBy: {created_by}")
        
        if ground_truth_id:
            # Query by GroundTruthId using GSI
            print(f"Querying evaluation tasks for GroundTruthId: {ground_truth_id}")
            
            if created_by:
                response = table.query(
                    IndexName='GroundTruthId-index',
                    KeyConditionExpression='GroundTruthId = :ground_truth_id',
                    FilterExpression='CreatedBy = :created_by',
                    ExpressionAttributeValues={
                        ':ground_truth_id': ground_truth_id,
                        ':created_by': created_by
                    }
                )
            else:
                response = table.query(
                    IndexName='GroundTruthId-index',
                    KeyConditionExpression='GroundTruthId = :ground_truth_id',
                    ExpressionAttributeValues={
                        ':ground_truth_id': ground_truth_id
                    }
                )
        elif video_id:
            # Query by VideoId using GSI
            print(f"Querying evaluation tasks for VideoId: {video_id}")
            
            if created_by:
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
                response = table.query(
                    IndexName='VideoId-index',
                    KeyConditionExpression='VideoId = :video_id',
                    ExpressionAttributeValues={
                        ':video_id': video_id
                    }
                )
        else:
            # Scan all evaluation tasks
            print("Scanning all evaluation tasks")
            
            if created_by:
                response = table.scan(
                    FilterExpression='CreatedBy = :created_by',
                    ExpressionAttributeValues={
                        ':created_by': created_by
                    }
                )
            else:
                response = table.scan()
        
        items = response.get('Items', [])
        print(f"Found {len(items)} evaluation task records")
        
        # Enrich each evaluation task with related details
        for item in items:
            # Fetch ground truth details
            gt_id = item.get('GroundTruthId')
            if gt_id:
                ground_truth = get_ground_truth_details(gt_id)
                if ground_truth:
                    item['groundTruth'] = ground_truth
            
            # Fetch video details with presigned URLs
            vid_id = item.get('VideoId')
            if vid_id:
                video = get_video_details(vid_id)
                if video:
                    item['video'] = video
            
            # Fetch analyze task details for each task in AnalyzeTasks array
            analyze_tasks = item.get('AnalyzeTasks', [])
            for analyze_task in analyze_tasks:
                task_id = analyze_task.get('VideoAnalyzeTaskId')
                if task_id:
                    task_details = get_analyze_task_details(task_id)
                    if task_details:
                        analyze_task['taskDetails'] = task_details
        
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'evaluationTasks': items,
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
